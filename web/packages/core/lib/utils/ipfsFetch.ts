/**
 * IPFS JSON fetch through the Zarf indexer backend with public gateway fallback.
 *
 * The indexer remains the preferred shared cache/proxy. Public gateways are a
 * recovery path for CID-addressed public metadata when the worker's upstream
 * gateway is temporarily rate-limited.
 *
 * @module utils/ipfsFetch
 */
import { fetchIndexerJson } from './indexerClient';

const MAX_CACHE_ENTRIES = 256;
const PUBLIC_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
    'https://w3s.link/ipfs',
];
const GATEWAY_TIMEOUT_MS = 10_000;

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
    const withoutScheme = trimmed.startsWith('ipfs://') ? trimmed.slice('ipfs://'.length) : trimmed;

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

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function fetchGatewayJson<T>(gateway: string, cid: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
        const response = await fetch(`${gateway}/${encodeURIComponent(cid)}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchPublicGatewayJson<T>(cid: string, indexerError: unknown): Promise<T> {
    const errors: string[] = [`indexer: ${errorMessage(indexerError)}`];

    for (const gateway of PUBLIC_GATEWAYS) {
        try {
            return await fetchGatewayJson<T>(gateway, cid);
        } catch (error) {
            errors.push(`${gateway}: ${errorMessage(error)}`);
        }
    }

    throw new IpfsFetchError(
        `Could not load IPFS JSON for ${cid}: ${errors.join('; ')}`,
        cid,
        'GATEWAY_FAILURE',
    );
}

/**
 * Fetch JSON content for a CID through the shared backend cache, falling back
 * to public gateways when the backend path is unavailable.
 */
export async function fetchIpfsJson<T = unknown>(cid: string): Promise<T> {
    const validCid = validateCid(cid);
    const cached = getCached<T>(validCid);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const indexed = await fetchIndexerJson<T>(`/v1/ipfs/${encodeURIComponent(validCid)}`);
        setCached(validCid, indexed);
        return indexed;
    } catch (error) {
        const gateway = await fetchPublicGatewayJson<T>(validCid, error);
        setCached(validCid, gateway);
        return gateway;
    }
}

export function clearIpfsCache(): void {
    cache.clear();
}
