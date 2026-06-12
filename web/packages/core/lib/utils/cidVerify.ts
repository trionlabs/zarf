/**
 * Self-certifying CID verification for JSON fetched from untrusted IPFS
 * gateways.
 *
 * A public gateway is just an HTTP server — nothing stops a compromised or
 * malicious one from returning arbitrary bytes for a CID. Content addressing
 * only helps if the client re-derives the CID from the bytes it received.
 *
 * Zarf claim lists are pinned via Pinata's `pinJSONToIPFS`, which produces
 * CIDv0 (dag-pb + UnixFS, kubo defaults: 256 KiB chunker, no raw leaves).
 * For content that fits in a single chunk the root block is fully
 * reconstructible from the content bytes, so the CID can be verified with
 * nothing but SHA-256 — no IPFS libraries needed. The encoding below was
 * validated byte-for-byte against production Pinata pins.
 *
 * Content larger than one chunk becomes a multi-block DAG whose root hash
 * cannot be recomputed from content bytes alone; that case reports
 * `unverifiable` and callers decide policy. (Zarf can afford to accept:
 * every security-relevant consumer of this JSON re-verifies against the
 * on-chain Merkle root, so tampering is bounded to display spoofing.)
 *
 * This module is dependency-free on purpose — it is shared by browser apps
 * and Cloudflare Workers (no Vite globals, no Node APIs; WebCrypto only).
 *
 * @module utils/cidVerify
 */

export type CidVerification = 'verified' | 'mismatch' | 'unverifiable';

/** kubo's default chunk size — above this, content is a multi-block DAG. */
const SINGLE_BLOCK_MAX_BYTES = 262_144;

const CODEC_RAW = 0x55;
const CODEC_DAG_PB = 0x70;
const CODEC_JSON = 0x0200;
const MULTIHASH_SHA2_256 = 0x12;
const SHA2_256_LENGTH = 32;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base58Decode(value: string): Uint8Array | null {
    let n = 0n;
    for (const char of value) {
        const idx = BASE58_ALPHABET.indexOf(char);
        if (idx === -1) return null;
        n = n * 58n + BigInt(idx);
    }
    const bytes: number[] = [];
    while (n > 0n) {
        bytes.unshift(Number(n & 0xffn));
        n >>= 8n;
    }
    for (const char of value) {
        if (char !== '1') break;
        bytes.unshift(0);
    }
    return Uint8Array.from(bytes);
}

function base32Decode(value: string): Uint8Array | null {
    const bytes: number[] = [];
    let bits = 0;
    let acc = 0;
    for (const char of value.toLowerCase()) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx === -1) return null;
        acc = (acc << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((acc >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    // Leftover bits are zero-padding from the base32 alignment; non-zero
    // leftovers mean a malformed encoding.
    if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) return null;
    return Uint8Array.from(bytes);
}

function readVarint(bytes: Uint8Array, offset: number): [value: number, next: number] | null {
    let value = 0;
    let shift = 0;
    let pos = offset;
    while (pos < bytes.length) {
        const byte = bytes[pos++];
        value += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) return [value, pos];
        shift += 7;
        if (shift > 28) return null; // larger than any codec/hash code we accept
    }
    return null;
}

function encodeVarint(n: number): Uint8Array {
    const out: number[] = [];
    while (n >= 0x80) {
        out.push((n & 0x7f) | 0x80);
        n >>>= 7;
    }
    out.push(n);
    return Uint8Array.from(out);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

/**
 * Encode `content` as the single dag-pb block kubo produces for a file that
 * fits in one chunk: PBNode{ Data: UnixFS{ Type: File, Data, filesize } }.
 */
function encodeUnixFsFileNode(content: Uint8Array): Uint8Array {
    const unixFs = concatBytes(
        Uint8Array.of(0x08), // field 1 (Type), varint
        encodeVarint(2), // DataType.File
        Uint8Array.of(0x12), // field 2 (Data), length-delimited
        encodeVarint(content.length),
        content,
        Uint8Array.of(0x18), // field 3 (filesize), varint
        encodeVarint(content.length),
    );
    return concatBytes(
        Uint8Array.of(0x0a), // PBNode field 1 (Data), length-delimited
        encodeVarint(unixFs.length),
        unixFs,
    );
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

interface ParsedCid {
    codec: number;
    digest: Uint8Array;
}

function parseCid(cid: string): ParsedCid | null {
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
        // CIDv0: base58btc multihash, implicit dag-pb codec.
        const decoded = base58Decode(cid);
        if (
            !decoded ||
            decoded.length !== 2 + SHA2_256_LENGTH ||
            decoded[0] !== MULTIHASH_SHA2_256 ||
            decoded[1] !== SHA2_256_LENGTH
        ) {
            return null;
        }
        return { codec: CODEC_DAG_PB, digest: decoded.subarray(2) };
    }

    if (/^b[a-z2-7]{40,}$/i.test(cid)) {
        // CIDv1 base32: varint version, varint codec, multihash.
        const decoded = base32Decode(cid.slice(1));
        if (!decoded) return null;
        const version = readVarint(decoded, 0);
        if (!version || version[0] !== 1) return null;
        const codec = readVarint(decoded, version[1]);
        if (!codec) return null;
        const hashCode = readVarint(decoded, codec[1]);
        if (!hashCode || hashCode[0] !== MULTIHASH_SHA2_256) return null;
        const hashLength = readVarint(decoded, hashCode[1]);
        if (!hashLength || hashLength[0] !== SHA2_256_LENGTH) return null;
        const digest = decoded.subarray(hashLength[1]);
        if (digest.length !== SHA2_256_LENGTH) return null;
        return { codec: codec[0], digest };
    }

    return null;
}

/**
 * Check whether `bytes` are the authentic content for `cid`.
 *
 * - `verified` — the bytes reproduce the CID's hash. Trust them.
 * - `mismatch` — the bytes provably do NOT match. Discard them.
 * - `unverifiable` — cannot decide from content bytes alone (multi-block
 *   DAG, non-sha256 hash, or unknown codec). Caller picks the policy.
 */
export async function verifyCidAgainstBytes(
    cid: string,
    bytes: Uint8Array,
): Promise<CidVerification> {
    const parsed = parseCid(cid);
    if (!parsed) return 'unverifiable';

    if (parsed.codec === CODEC_RAW || parsed.codec === CODEC_JSON) {
        // Raw/json blocks hash the content bytes directly.
        return bytesEqual(await sha256(bytes), parsed.digest) ? 'verified' : 'mismatch';
    }

    if (parsed.codec === CODEC_DAG_PB) {
        if (bytes.length > SINGLE_BLOCK_MAX_BYTES) return 'unverifiable';
        const block = encodeUnixFsFileNode(bytes);
        return bytesEqual(await sha256(block), parsed.digest) ? 'verified' : 'mismatch';
    }

    return 'unverifiable';
}

/**
 * Read a fetch Response body while enforcing a byte ceiling, so a hostile
 * server cannot balloon memory before verification even runs. Rejects as
 * soon as the limit is crossed rather than buffering first.
 */
export async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
    const contentLength = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new Error(`response exceeds ${maxBytes} bytes`);
    }

    if (!response.body) {
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (buffer.length > maxBytes) {
            throw new Error(`response exceeds ${maxBytes} bytes`);
        }
        return buffer;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error(`response exceeds ${maxBytes} bytes`);
        }
        chunks.push(value);
    }
    return concatBytes(...chunks);
}
