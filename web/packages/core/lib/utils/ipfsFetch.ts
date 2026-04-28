/**
 * IPFS fetch with multi-gateway fallback.
 *
 * Tries gateways in order with a per-gateway timeout. Caches successful
 * fetches in-memory for the session (CIDs are immutable, so cache forever
 * is fine). Designed so a single slow gateway doesn't stall the UI.
 *
 * @module utils/ipfsFetch
 */

const GATEWAYS = [
    'https://cloudflare-ipfs.com/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
];

const PER_GATEWAY_TIMEOUT_MS = 5_000;

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

/**
 * Fetch JSON content for a CID, racing through gateways sequentially
 * (not in parallel — we want to be polite to public gateways).
 */
export async function fetchIpfsJson<T = unknown>(cid: string): Promise<T> {
    if (cache.has(cid)) {
        return cache.get(cid) as T;
    }

    const errors: string[] = [];
    for (const gateway of GATEWAYS) {
        try {
            const data = await fetchFromGateway<T>(gateway, cid);
            cache.set(cid, data);
            return data;
        } catch (err) {
            errors.push(`${gateway}: ${(err as Error).message}`);
        }
    }

    throw new IpfsFetchError(
        `All IPFS gateways failed for ${cid}: ${errors.join('; ')}`,
        cid,
    );
}

export function clearIpfsCache(): void {
    cache.clear();
}
