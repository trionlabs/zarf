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
import { serializeClaimList } from '@zarf/core/domain/claimListBuilder';

export class PinError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'PinError';
    }
}

interface PinResponse {
    cid: string;
    size?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function getProxyUrl(): string {
    const url = import.meta.env.VITE_PIN_PROXY_URL;
    if (!url) {
        throw new PinError('VITE_PIN_PROXY_URL is not configured');
    }
    return url.replace(/\/+$/, '');
}

async function postPin(body: string, timeoutMs: number): Promise<PinResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
        res = await fetch(`${getProxyUrl()}/pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
 * Pin a claim list to IPFS via the proxy worker.
 *
 * Retries once on transient network failure. The pin operation itself is
 * idempotent (same content = same CID), so a retry that succeeds returns
 * the same CID as the original attempt would have.
 */
export async function pinClaimList(
    doc: ClaimListJson,
    opts: { timeoutMs?: number } = {},
): Promise<{ cid: string }> {
    const body = serializeClaimList(doc);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
        const res = await postPin(body, timeoutMs);
        return { cid: res.cid };
    } catch (err) {
        if (!(err instanceof PinError)) throw err;
        // Single retry on transient failure
        const res = await postPin(body, timeoutMs);
        return { cid: res.cid };
    }
}
