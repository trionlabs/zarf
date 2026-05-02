/**
 * IPFS fetch with multi-gateway fallback.
 *
 * Tries gateways in order with a per-gateway timeout. Caches successful
 * fetches in-memory for the session with bounded LRU eviction. Designed so a
 * single slow gateway doesn't stall the UI.
 *
 * @module utils/ipfsFetch
 */

const GATEWAYS = [
    'https://cloudflare-ipfs.com/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
];

const PER_GATEWAY_TIMEOUT_MS = 5_000;
const MAX_CACHE_ENTRIES = 256;

const cache = new Map<string, unknown>();

export class IpfsFetchError extends Error {
    constructor(message: string, public readonly cid: string) {
        super(message);
        this.name = 'IpfsFetchError';
    }
}

async function fetchFromGateway<T>(gateway: string, cid: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_GATEWAY_TIMEOUT_MS);

    try {
        const res = await fetch(`${gateway}/${cid}`, { signal: controller.signal });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

function validateCid(cid: unknown): string {
    if (typeof cid !== 'string') {
        throw new IpfsFetchError(`Invalid CID: ${String(cid)}`, String(cid));
    }

    const trimmed = cid.trim();
    if (
        trimmed.length === 0 ||
        trimmed !== cid ||
        trimmed.includes('/') ||
        !/^[a-zA-Z0-9]+$/.test(trimmed)
    ) {
        throw new IpfsFetchError(`Invalid CID: ${cid}`, cid);
    }

    return trimmed;
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
 * Fetch JSON content for a CID, racing through gateways sequentially
 * (not in parallel — we want to be polite to public gateways).
 */
export async function fetchIpfsJson<T = unknown>(cid: string): Promise<T> {
    const validCid = validateCid(cid);
    const cached = getCached<T>(validCid);
    if (cached !== undefined) {
        return cached;
    }

    const errors: string[] = [];
    for (const gateway of GATEWAYS) {
        try {
            const data = await fetchFromGateway<T>(gateway, validCid);
            setCached(validCid, data);
            return data;
        } catch (err) {
            errors.push(`${gateway}: ${(err as Error).message}`);
        }
    }

    throw new IpfsFetchError(
        `All IPFS gateways failed for ${validCid}: ${errors.join('; ')}`,
        validCid,
    );
}

export function clearIpfsCache(): void {
    cache.clear();
}
