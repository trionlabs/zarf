/**
 * Zarf Pin Proxy Worker
 *
 * Stateless Cloudflare Worker that pins JSON claim lists to IPFS via Pinata,
 * keeping the Pinata JWT server-side so it never ships to the browser.
 *
 * Routes:
 *   POST /pin     - pin a claim list, returns { cid }
 *   GET  /ipfs/:cid - fetch pinned/public JSON through the proxy gateway
 *   GET  /health  - liveness check
 *
 * Secrets (wrangler secret put):
 *   PINATA_JWT
 *
 * Vars (wrangler.jsonc):
 *   ALLOWED_ORIGINS  - comma-separated list of allowed CORS origins
 *   MAX_BODY_BYTES   - max accepted body size (string-encoded number)
 */

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { readBodyWithLimit, verifyCidAgainstBytes } from '@zarf/core/utils/cidVerify';
import { Buffer } from 'buffer';

interface Env {
    PINATA_JWT: string;
    ALLOWED_ORIGINS: string;
    MAX_BODY_BYTES: string;
}

interface ClaimList {
    merkleRoot: string;
    leaves: string[];
    schedule: unknown;
    emailHashes?: string[];
    [key: string]: unknown;
}

/** The standalone airdrop claim-list shape (doc 09 §6): `root`/`claims`, no `schedule`. */
interface AirdropClaimList {
    v: number;
    network: string;
    airdrop: string;
    token: string;
    root: string;
    format: unknown;
    claims: Array<{ address: string; amount: string; proof: string[] }>;
    [key: string]: unknown;
}

interface PinataResponse {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
}

const PINATA_PIN_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PIN_AUTH_VERSION = 'zarf-pin-v1';
const PIN_AUTH_MAX_AGE_MS = 5 * 60 * 1000;
const SEP53_MESSAGE_PREFIX = 'Stellar Signed Message:\n';
const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const IPFS_READ_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
];
const MAX_GATEWAY_RESPONSE_BYTES = 8 * 1024 * 1024;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');
        const corsHeaders = buildCorsHeaders(origin, env);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (url.pathname === '/health' && request.method === 'GET') {
            return json({ ok: true }, 200, corsHeaders);
        }

        if (url.pathname === '/pin' && request.method === 'POST') {
            return handlePin(request, env, corsHeaders);
        }

        if (url.pathname === '/pin-airdrop' && request.method === 'POST') {
            return handlePinAirdrop(request, env, corsHeaders);
        }

        if (url.pathname.startsWith('/ipfs/') && request.method === 'GET') {
            return handleIpfsRead(url, corsHeaders);
        }

        return json({ error: 'not_found' }, 404, corsHeaders);
    },
};

async function handlePin(
    request: Request,
    env: Env,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const maxBytes = Number(env.MAX_BODY_BYTES) || 1_048_576;
    const contentLength = Number(request.headers.get('Content-Length') || '0');
    if (contentLength > maxBytes) {
        return json({ error: 'payload_too_large', maxBytes }, 413, corsHeaders);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return json({ error: 'unsupported_media_type' }, 415, corsHeaders);
    }

    let raw: string;
    let body: ClaimList;
    try {
        raw = await request.text();
        if (new TextEncoder().encode(raw).length > maxBytes) {
            return json({ error: 'payload_too_large', maxBytes }, 413, corsHeaders);
        }
        body = JSON.parse(raw);
    } catch {
        return json({ error: 'invalid_json' }, 400, corsHeaders);
    }

    const validationError = validateClaimList(body);
    if (validationError) {
        return json({ error: 'invalid_claim_list', reason: validationError }, 400, corsHeaders);
    }

    const authError = await validatePinAuth(request, raw, body.merkleRoot);
    if (authError) {
        return json(
            { error: 'unauthorized_pin', reason: authError.reason },
            authError.status,
            corsHeaders,
        );
    }

    if (!env.PINATA_JWT) {
        return json({ error: 'pinata_not_configured' }, 500, corsHeaders);
    }

    let pinataRes: Response;
    try {
        pinataRes = await fetch(PINATA_PIN_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.PINATA_JWT}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pinataContent: body,
                pinataMetadata: {
                    name: `zarf-claim-list-${body.merkleRoot}`,
                },
            }),
        });
    } catch {
        return json({ error: 'pinata_unreachable' }, 502, corsHeaders);
    }

    if (!pinataRes.ok) {
        const detail = await safeText(pinataRes);
        return json({ error: 'pinata_error', status: pinataRes.status, detail }, 502, corsHeaders);
    }

    const data = (await pinataRes.json()) as PinataResponse;
    return json({ cid: data.IpfsHash, size: data.PinSize }, 200, corsHeaders);
}

/**
 * Pin an airdrop claim-list (doc 09 §6 shape). Additive sibling of `handlePin`;
 * the vesting `/pin` route is untouched (D4). Auth is the shared
 * `validatePinAuth`, bound to the claim-list `root`.
 */
async function handlePinAirdrop(
    request: Request,
    env: Env,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const maxBytes = Number(env.MAX_BODY_BYTES) || 1_048_576;
    const contentLength = Number(request.headers.get('Content-Length') || '0');
    if (contentLength > maxBytes) {
        return json({ error: 'payload_too_large', maxBytes }, 413, corsHeaders);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return json({ error: 'unsupported_media_type' }, 415, corsHeaders);
    }

    let raw: string;
    let body: AirdropClaimList;
    try {
        raw = await request.text();
        if (new TextEncoder().encode(raw).length > maxBytes) {
            return json({ error: 'payload_too_large', maxBytes }, 413, corsHeaders);
        }
        body = JSON.parse(raw);
    } catch {
        return json({ error: 'invalid_json' }, 400, corsHeaders);
    }

    const validationError = validateAirdropClaimList(body);
    if (validationError) {
        return json({ error: 'invalid_claim_list', reason: validationError }, 400, corsHeaders);
    }

    const authError = await validatePinAuth(request, raw, body.root);
    if (authError) {
        return json(
            { error: 'unauthorized_pin', reason: authError.reason },
            authError.status,
            corsHeaders,
        );
    }

    if (!env.PINATA_JWT) {
        return json({ error: 'pinata_not_configured' }, 500, corsHeaders);
    }

    let pinataRes: Response;
    try {
        pinataRes = await fetch(PINATA_PIN_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.PINATA_JWT}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pinataContent: body,
                pinataMetadata: {
                    name: `zarf-airdrop-list-${body.root}`,
                },
            }),
        });
    } catch {
        return json({ error: 'pinata_unreachable' }, 502, corsHeaders);
    }

    if (!pinataRes.ok) {
        const detail = await safeText(pinataRes);
        return json({ error: 'pinata_error', status: pinataRes.status, detail }, 502, corsHeaders);
    }

    const data = (await pinataRes.json()) as PinataResponse;
    return json({ cid: data.IpfsHash, size: data.PinSize }, 200, corsHeaders);
}

async function handleIpfsRead(url: URL, corsHeaders: Record<string, string>): Promise<Response> {
    const cid = validateCid(url.pathname.slice('/ipfs/'.length));
    if (!cid) {
        return json({ error: 'invalid_cid' }, 400, corsHeaders);
    }

    const errors: string[] = [];
    for (const gateway of IPFS_READ_GATEWAYS) {
        try {
            const upstream = await fetch(`${gateway}/${cid}`, {
                headers: { Accept: 'application/json' },
            });
            if (!upstream.ok) {
                errors.push(`${gateway}: HTTP ${upstream.status}`);
                continue;
            }

            // This route republishes gateway content under our own origin,
            // so the bytes must be authenticated against the CID before
            // being passed on (see cidVerify for the trust model). The
            // original bytes are served so downstream clients can re-verify.
            const bytes = await readBodyWithLimit(upstream, MAX_GATEWAY_RESPONSE_BYTES);
            const verification = await verifyCidAgainstBytes(cid, bytes);
            if (verification === 'mismatch') {
                errors.push(`${gateway}: content hash does not match CID`);
                continue;
            }
            if (verification === 'unverifiable') {
                console.warn(`[PinProxy] Unverifiable gateway response accepted for ${cid}`);
            }

            try {
                JSON.parse(new TextDecoder().decode(bytes));
            } catch {
                errors.push(`${gateway}: content is not JSON`);
                continue;
            }

            const headers = new Headers(corsHeaders);
            // Fixed JSON content type (never the upstream header): this is an
            // open passthrough, and reflecting a gateway-controlled type such
            // as text/html would let pinned HTML render on this origin.
            headers.set('Content-Type', 'application/json');
            headers.set('X-Content-Type-Options', 'nosniff');
            headers.set('Cache-Control', 'public, max-age=300');
            return new Response(bytes, { status: 200, headers });
        } catch (error) {
            errors.push(`${gateway}: ${(error as Error).message}`);
        }
    }

    return json({ error: 'ipfs_gateway_error', detail: errors.join('; ') }, 502, corsHeaders);
}

function validateClaimList(body: unknown): string | null {
    if (!body || typeof body !== 'object') return 'not_an_object';
    const obj = body as Record<string, unknown>;

    if (typeof obj.merkleRoot !== 'string' || !HEX_32.test(obj.merkleRoot)) {
        return 'missing_or_invalid_merkleRoot';
    }
    if (!Array.isArray(obj.leaves) || obj.leaves.length === 0) {
        return 'missing_or_empty_leaves';
    }
    if (obj.leaves.some((leaf) => typeof leaf !== 'string' || !HEX_32.test(leaf))) {
        return 'invalid_leaf';
    }
    if (!obj.schedule || typeof obj.schedule !== 'object') {
        return 'missing_schedule';
    }
    return null;
}

/**
 * Validate the airdrop claim-list shape (doc 09 §6): `v`/`network`/`airdrop`/
 * `token`/`root`/`format`/`claims`, with a 0x-hex root and per-claim proofs.
 * No `schedule` (that is the vesting shape). Additive — `validateClaimList`
 * stays untouched.
 */
function validateAirdropClaimList(body: unknown): string | null {
    if (!body || typeof body !== 'object') return 'not_an_object';
    const obj = body as Record<string, unknown>;

    if (obj.v !== 1) return 'invalid_version';
    if (obj.network !== 'testnet' && obj.network !== 'mainnet') return 'invalid_network';
    if (typeof obj.airdrop !== 'string' || obj.airdrop.length === 0) return 'missing_airdrop';
    if (typeof obj.token !== 'string' || obj.token.length === 0) return 'missing_token';
    if (typeof obj.root !== 'string' || !HEX_32.test(obj.root)) return 'missing_or_invalid_root';
    if (!obj.format || typeof obj.format !== 'object') return 'missing_format';
    if (!Array.isArray(obj.claims) || obj.claims.length === 0) return 'missing_or_empty_claims';

    for (const entry of obj.claims) {
        if (!entry || typeof entry !== 'object') return 'invalid_claim';
        const claim = entry as Record<string, unknown>;
        if (typeof claim.address !== 'string' || claim.address.length === 0) {
            return 'invalid_claim_address';
        }
        if (typeof claim.amount !== 'string' || !/^\d+$/.test(claim.amount)) {
            return 'invalid_claim_amount';
        }
        if (!Array.isArray(claim.proof)) return 'invalid_claim_proof';
        if (claim.proof.some((node) => typeof node !== 'string' || !HEX_32.test(node))) {
            return 'invalid_proof_node';
        }
    }
    return null;
}

interface PinAuthError {
    status: number;
    reason: string;
}

async function validatePinAuth(
    request: Request,
    rawBody: string,
    merkleRoot: string,
): Promise<PinAuthError | null> {
    const owner = request.headers.get('X-Zarf-Owner')?.trim();
    const issuedAtRaw = request.headers.get('X-Zarf-Issued-At')?.trim();
    const bodyHash = request.headers.get('X-Zarf-Body-SHA256')?.trim();
    const signature = request.headers.get('X-Zarf-Signature')?.trim();

    if (!owner || !issuedAtRaw || !bodyHash || !signature) {
        return { status: 401, reason: 'missing_auth_headers' };
    }
    if (!StrKey.isValidEd25519PublicKey(owner)) {
        return { status: 401, reason: 'invalid_owner' };
    }

    const issuedAt = Number(issuedAtRaw);
    if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
        return { status: 401, reason: 'invalid_issued_at' };
    }
    if (Math.abs(Date.now() - issuedAt) > PIN_AUTH_MAX_AGE_MS) {
        return { status: 401, reason: 'expired_signature' };
    }

    if (!/^[0-9a-fA-F]{64}$/.test(bodyHash)) {
        return { status: 401, reason: 'invalid_body_hash' };
    }
    const expectedBodyHash = await sha256Hex(rawBody);
    if (bodyHash.toLowerCase() !== expectedBodyHash) {
        return { status: 401, reason: 'body_hash_mismatch' };
    }

    const signatureBytes = decodeSignature(signature);
    if (!signatureBytes) {
        return { status: 401, reason: 'invalid_signature_encoding' };
    }

    const message = buildPinAuthMessage({
        owner,
        merkleRoot,
        bodyHash: expectedBodyHash,
        issuedAt,
    });

    const verified = Keypair.fromPublicKey(owner).verify(
        await sep53MessageHash(message),
        signatureBytes,
    );
    return verified ? null : { status: 401, reason: 'invalid_signature' };
}

function buildPinAuthMessage(input: {
    owner: string;
    merkleRoot: string;
    bodyHash: string;
    issuedAt: number;
}): string {
    return [
        PIN_AUTH_VERSION,
        `owner:${input.owner}`,
        `merkleRoot:${input.merkleRoot}`,
        `bodyHash:${input.bodyHash}`,
        `issuedAt:${input.issuedAt}`,
    ].join('\n');
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function sep53MessageHash(message: string): Promise<Buffer> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${SEP53_MESSAGE_PREFIX}${message}`),
    );
    return Buffer.from(digest);
}

function decodeSignature(raw: string): Buffer | null {
    if (raw.length > 512) return null;
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (/^[0-9a-fA-F]{128}$/.test(hex)) {
        return Buffer.from(hex, 'hex');
    }

    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
        return null;
    }
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

    try {
        const decoded = Buffer.from(padded, 'base64');
        return decoded.length === 64 ? decoded : null;
    } catch {
        return null;
    }
}

function validateCid(raw: string): string | null {
    let decoded: string;
    try {
        decoded = decodeURIComponent(raw).trim();
    } catch {
        return null;
    }

    const cid = decoded.startsWith('ipfs://') ? decoded.slice('ipfs://'.length) : decoded;
    const cidV0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidV1Base32 = /^b[a-z2-7]{40,}$/i;
    if (cid.includes('/') || cid.includes('?') || cid.includes('#')) return null;
    return cidV0.test(cid) || cidV1Base32.test(cid) ? cid : null;
}

function buildCorsHeaders(origin: string | null, env: Env): Record<string, string> {
    const allowed = (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

    const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || '*';

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, X-Zarf-Owner, X-Zarf-Issued-At, X-Zarf-Body-SHA256, X-Zarf-Signature',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...extraHeaders,
        },
    });
}

async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 500);
    } catch {
        return '';
    }
}
