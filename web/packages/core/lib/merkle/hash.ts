/**
 * Leaf/node hashing for the airdrop Merkle tree — the single source of these
 * primitives (doc 06 §15.4). Byte-identical to the Rust contract
 * (`contracts/soroban/zarf/airdrop`): plain keccak256, domain tags `0x00`
 * (leaf) / `0x01` (node), sorted-pair nodes, and crucially NO BN254 field
 * reduction (the load-bearing difference from `recipient_id`; doc 09 §2).
 *
 * @module merkle/hash
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { Address } from '@stellar/stellar-sdk';

/** Lowercase `0x`-prefixed hex of a byte array. */
export function toHex(bytes: Uint8Array): string {
    let s = '0x';
    for (const byte of bytes) s += byte.toString(16).padStart(2, '0');
    return s;
}

/** Parse a `0x`-prefixed (or bare) 32-byte hex string into bytes. */
export function fromHex(hex: string): Uint8Array {
    const h = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (h.length !== 64) throw new Error(`expected 32-byte hex, got ${h.length} chars`);
    // Reject non-hex characters: parseInt('zz', 16) yields NaN, which would
    // silently coerce to a 0 byte. Fail closed like the Rust `from_hex0x`.
    if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error('expected hex characters');
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function u32be(n: number): Uint8Array {
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
        throw new RangeError(`index out of u32 range: ${n}`);
    }
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, false);
    return b;
}

const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;

/** i128 → 16-byte big-endian two's complement (matches Rust `i128::to_be_bytes`). */
function i128be(amount: bigint): Uint8Array {
    if (amount < I128_MIN || amount > I128_MAX) {
        throw new RangeError(`amount out of i128 range: ${amount}`);
    }
    const b = new Uint8Array(16);
    let v = amount < 0n ? (1n << 128n) + amount : amount;
    for (let i = 15; i >= 0; i--) {
        b[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return b;
}

/**
 * JS equivalent of Rust `Address::to_xdr(&env)`: the ScVal XDR of the address
 * (`Address.fromString().toScVal().toXDR()`). NOT a bare ed25519 key —
 * `StrKey.decode` would skip the XDR envelope and silently diverge (doc 09
 * §3.3). `fromString` also rejects muxed `M…` and malformed strkeys.
 */
export function addressXdr(strkey: string): Uint8Array {
    return new Uint8Array(Address.fromString(strkey).toScVal().toXDR());
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

/** Lexicographic byte comparison (matches Rust `a.to_array() <= b.to_array()`). */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return a.length - b.length;
}

/** Raw 32-byte leaf hash: `keccak256(0x00 ‖ index_be32 ‖ to_xdr ‖ amount_be128)`. */
export function leafBytes(index: number, address: string, amount: bigint): Uint8Array {
    return keccak_256(
        concatBytes([Uint8Array.of(0x00), u32be(index), addressXdr(address), i128be(amount)]),
    );
}

/** Raw 32-byte node hash: `keccak256(0x01 ‖ sorted(L, R))` — no direction bit. */
export function hashNodeBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const [lo, hi] = compareBytes(a, b) <= 0 ? [a, b] : [b, a];
    return keccak_256(concatBytes([Uint8Array.of(0x01), lo, hi]));
}
