/**
 * Pin Service (airdrop) — thin client for the zarf-pin-proxy Worker's
 * `/pin-airdrop` route. Posts the airdrop claim-list JSON, receives an IPFS CID.
 *
 * Mirrors the vesting create-app `pinService`; two deliberate differences:
 *   1. endpoint is `/pin-airdrop` (the vesting `/pin` route is untouched, D4);
 *   2. the auth signature binds `doc.root` (the airdrop doc's root field is
 *      `root`, not `merkleRoot`) — the worker's shared `validatePinAuth` is
 *      passed `body.root`, so the signed `merkleRoot:` label carries the root.
 *
 * The Pinata JWT lives server-side on the worker; the browser never sees it.
 *
 * @module services/pinService
 */
import type { AirdropClaimListJson } from '@zarf/core/merkle';
import { serializeClaimList } from '@zarf/core/merkle';
import { signMessage } from '@zarf/core/contracts/wallet';
import type { StellarAddress } from '@zarf/core/types';

export class PinError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'PinError';
    }
}

interface PinResponse {
    cid: string;
    size?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const PIN_AUTH_VERSION = 'zarf-pin-v1';

interface PinOptions {
    owner: StellarAddress;
    timeoutMs?: number;
}

function getProxyUrl(): string {
    const url = import.meta.env.VITE_PIN_PROXY_URL;
    if (!url) {
        throw new PinError('VITE_PIN_PROXY_URL is not configured');
    }
    return url.replace(/\/+$/, '');
}

function bytesToHex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function sha256Hex(value: string): Promise<string> {
    return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/**
 * The signed pin-auth message. The `merkleRoot:` label is shared with the
 * vesting route (the worker reuses one `buildPinAuthMessage`); for an airdrop
 * its value is the claim-list `root`.
 */
function buildPinAuthMessage(input: {
    owner: StellarAddress;
    root: string;
    bodyHash: string;
    issuedAt: number;
}): string {
    return [
        PIN_AUTH_VERSION,
        `owner:${input.owner}`,
        `merkleRoot:${input.root}`,
        `bodyHash:${input.bodyHash}`,
        `issuedAt:${input.issuedAt}`,
    ].join('\n');
}

async function buildAuthHeaders(
    doc: AirdropClaimListJson,
    body: string,
    owner: StellarAddress,
): Promise<Record<string, string>> {
    const issuedAt = Date.now();
    const bodyHash = await sha256Hex(body);
    const message = buildPinAuthMessage({ owner, root: doc.root, bodyHash, issuedAt });
    const signature = await signMessage(message, owner);

    return {
        'X-Zarf-Owner': owner,
        'X-Zarf-Issued-At': String(issuedAt),
        'X-Zarf-Body-SHA256': bodyHash,
        'X-Zarf-Signature': signature,
    };
}

async function postPin(
    body: string,
    timeoutMs: number,
    authHeaders: Record<string, string>,
): Promise<PinResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
        res = await fetch(`${getProxyUrl()}/pin-airdrop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body,
            signal: controller.signal,
        });
    } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
            throw new PinError(`Pin request timed out after ${timeoutMs}ms`);
        }
        throw new PinError('Pin proxy unreachable', err);
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        let detail = '';
        try {
            detail = await res.text();
        } catch {
            // ignore
        }
        throw new PinError(`Pin proxy returned ${res.status}: ${detail.slice(0, 200)}`);
    }

    let json: unknown;
    try {
        json = await res.json();
    } catch (err) {
        throw new PinError('Pin proxy returned invalid JSON', err);
    }
    if (!json || typeof json !== 'object' || typeof (json as PinResponse).cid !== 'string') {
        throw new PinError('Pin proxy response missing cid');
    }
    return json as PinResponse;
}

/**
 * Pin an airdrop claim-list to IPFS via the proxy worker. Retries once on
 * transient network failure; pinning is idempotent (same content = same CID),
 * so a retry returns the same CID.
 */
export async function pinAirdropClaimList(
    doc: AirdropClaimListJson,
    opts: PinOptions,
): Promise<{ cid: string }> {
    const body = serializeClaimList(doc);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const authHeaders = await buildAuthHeaders(doc, body, opts.owner);

    try {
        const res = await postPin(body, timeoutMs, authHeaders);
        return { cid: res.cid };
    } catch (err) {
        if (!(err instanceof PinError)) throw err;
        const res = await postPin(body, timeoutMs, authHeaders);
        return { cid: res.cid };
    }
}
