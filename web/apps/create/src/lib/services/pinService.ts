/**
 * Pin Service
 *
 * Thin client for the zarf-pin-proxy Cloudflare Worker.
 * Sends a claim list JSON, receives an IPFS CID. The Pinata JWT lives
 * server-side on the worker; the browser never sees it.
 *
 * @module services/pinService
 */

import type { ClaimListJson } from '@zarf/core/domain/claimListBuilder';
import { serializeClaimList as serializeEmailClaimList } from '@zarf/core/domain/claimListBuilder';
import type { AirdropClaimListJson } from '@zarf/core/merkle';
import { signMessage } from '@zarf/core/contracts/wallet';
import type { StellarAddress } from '@zarf/core/types';

export class PinError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown,
        /** True only for failures that a retry could plausibly fix. */
        public readonly transient = false,
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

interface PinClaimListOptions {
    owner: StellarAddress;
    timeoutMs?: number;
}

type PinEndpoint = '/pin' | '/pin-airdrop';

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

function buildPinAuthMessage(input: {
    owner: StellarAddress;
    root: string;
    bodyHash: string;
    issuedAt: number;
}): string {
    return [
        PIN_AUTH_VERSION,
        `owner:${input.owner}`,
        // The worker's shared auth message uses `merkleRoot:` for both schemas.
        // Wallet airdrop docs call the same value `root`.
        `merkleRoot:${input.root}`,
        `bodyHash:${input.bodyHash}`,
        `issuedAt:${input.issuedAt}`,
    ].join('\n');
}

async function buildAuthHeaders(input: { root: string; body: string; owner: StellarAddress }) {
    const issuedAt = Date.now();
    const bodyHash = await sha256Hex(input.body);
    const message = buildPinAuthMessage({
        owner: input.owner,
        root: input.root,
        bodyHash,
        issuedAt,
    });
    const signature = await signMessage(message, input.owner);

    return {
        'X-Zarf-Owner': input.owner,
        'X-Zarf-Issued-At': String(issuedAt),
        'X-Zarf-Body-SHA256': bodyHash,
        'X-Zarf-Signature': signature,
    };
}

async function postPin(
    endpoint: PinEndpoint,
    body: string,
    timeoutMs: number,
    authHeaders: Record<string, string>,
): Promise<PinResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
        res = await fetch(`${getProxyUrl()}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body,
            signal: controller.signal,
        });
    } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
            throw new PinError(`Pin request timed out after ${timeoutMs}ms`, err, true);
        }
        throw new PinError('Pin proxy unreachable', err, true);
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
        const transient = res.status >= 500 || res.status === 429;
        throw new PinError(
            `Pin proxy returned ${res.status}: ${detail.slice(0, 200)}`,
            undefined,
            transient,
        );
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

async function pinSerialized(input: {
    endpoint: PinEndpoint;
    body: string;
    root: string;
    owner: StellarAddress;
    timeoutMs?: number;
    shouldRetry(error: PinError): boolean;
}): Promise<{ cid: string }> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const authHeaders = await buildAuthHeaders({
        root: input.root,
        body: input.body,
        owner: input.owner,
    });

    try {
        const res = await postPin(input.endpoint, input.body, timeoutMs, authHeaders);
        return { cid: res.cid };
    } catch (err) {
        if (!(err instanceof PinError) || !input.shouldRetry(err)) throw err;
        const res = await postPin(input.endpoint, input.body, timeoutMs, authHeaders);
        return { cid: res.cid };
    }
}

/**
 * Pin a claim list to IPFS via the proxy worker.
 *
 * Retries once on transient network failure. The pin operation itself is
 * idempotent (same content = same CID), so a retry that succeeds returns
 * the same CID as the original attempt would have.
 */
export async function pinClaimList(
    doc: ClaimListJson,
    opts: PinClaimListOptions,
): Promise<{ cid: string }> {
    return pinSerialized({
        endpoint: '/pin',
        body: serializeEmailClaimList(doc),
        root: doc.merkleRoot,
        owner: opts.owner,
        timeoutMs: opts.timeoutMs,
        // Preserve existing email-create behavior: one retry for any PinError.
        shouldRetry: () => true,
    });
}

/**
 * Pin a wallet-airdrop claim list to IPFS via the proxy worker. Retries once on
 * transient failures only: a network error/timeout, or a 5xx/429 from the proxy.
 * A deterministic 4xx is not retried because the second signed POST would fail
 * the same way.
 */
export async function pinAirdropClaimList(
    doc: AirdropClaimListJson,
    opts: PinClaimListOptions,
): Promise<{ cid: string }> {
    const { serializeClaimList } = await import('@zarf/core/merkle');

    return pinSerialized({
        endpoint: '/pin-airdrop',
        body: serializeClaimList(doc),
        root: doc.root,
        owner: opts.owner,
        timeoutMs: opts.timeoutMs,
        shouldRetry: (error) => error.transient,
    });
}
