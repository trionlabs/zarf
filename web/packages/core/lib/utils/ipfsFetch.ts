/**
 * IPFS fetch with multi-gateway fallback.
 *
 * Tries gateways in order with a per-gateway timeout. Caches successful
 * fetches in-memory for the session with bounded LRU eviction. Designed so a
 * single slow gateway doesn't stall the UI.
 *
 * @module utils/ipfsFetch
 */
import { getCoreConfig } from '../config/runtime';

const PUBLIC_GATEWAYS = [
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
    'https://gateway.pinata.cloud/ipfs',
    'https://w3s.link/ipfs',
];

const PER_GATEWAY_TIMEOUT_MS = 5_000;
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

function configuredGateway(): string | null {
    try {
        const configured = getCoreConfig().ipfsGatewayUrl?.trim();
        if (!configured) return null;
        return configured.replace(/\/$/, '');
    } catch {
        return null;
    }
}

function gateways(): string[] {
    return Array.from(
        new Set([configuredGateway(), ...PUBLIC_GATEWAYS].filter((g): g is string => Boolean(g))),
    );
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
    for (const gateway of gateways()) {
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
        'GATEWAY_FAILURE',
    );
}

export function clearIpfsCache(): void {
    cache.clear();
}
