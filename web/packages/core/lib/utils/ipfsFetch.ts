/**
 * IPFS JSON fetch through the Zarf indexer backend.
 *
 * The browser never falls back to public gateways. If the indexer is down,
 * callers receive the backend error and can no-op or show UI state.
 *
 * @module utils/ipfsFetch
 */
import { fetchIndexerJson } from './indexerClient';

const MAX_CACHE_ENTRIES = 256;

const cache = new Map<string, unknown>();

export class IpfsFetchError extends Error {
    constructor(
        message: string,
        public readonly cid: string,
        public readonly code: 'INVALID_CID' | 'GATEWAY_FAILURE' = 'GATEWAY_FAILURE',
    ) {
        super(message);
        this.name = 'IpfsFetchError';
    }
}

function validateCid(cid: unknown): string {
    if (typeof cid !== 'string') {
        throw new IpfsFetchError(`Invalid CID: ${String(cid)}`, String(cid), 'INVALID_CID');
    }

    const trimmed = cid.trim();
    const withoutScheme = trimmed.startsWith('ipfs://')
        ? trimmed.slice('ipfs://'.length)
        : trimmed;

    if (
        trimmed.length === 0 ||
        trimmed !== cid ||
        withoutScheme.length === 0 ||
        withoutScheme.includes('/') ||
        withoutScheme.includes('?') ||
        withoutScheme.includes('#') ||
        !isLikelyCid(withoutScheme)
    ) {
        throw new IpfsFetchError(`Invalid CID: ${cid}`, cid, 'INVALID_CID');
    }

    return withoutScheme;
}

function isLikelyCid(value: string): boolean {
    const cidV0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidV1Base32 = /^b[a-z2-7]{40,}$/i;
    return cidV0.test(value) || cidV1Base32.test(value);
}

function getCached<T>(cid: string): T | undefined {
    if (!cache.has(cid)) return undefined;
    const value = cache.get(cid) as T;
    cache.delete(cid);
    cache.set(cid, value);
    return value;
}

function setCached(cid: string, data: unknown): void {
    if (cache.has(cid)) {
        cache.delete(cid);
    } else if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value as string | undefined;
        if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(cid, data);
}

/**
 * Fetch JSON content for a CID through the shared backend cache.
 */
export async function fetchIpfsJson<T = unknown>(cid: string): Promise<T> {
    const validCid = validateCid(cid);
    const cached = getCached<T>(validCid);
    if (cached !== undefined) {
        return cached;
    }

    const indexed = await fetchIndexerJson<T>(`/v1/ipfs/${encodeURIComponent(validCid)}`);
    setCached(validCid, indexed);
    return indexed;
}

export function clearIpfsCache(): void {
    cache.clear();
}
