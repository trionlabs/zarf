/**
 * IPFS JSON fetch through the Zarf indexer backend with public gateway fallback.
 *
 * The indexer remains the preferred shared cache/proxy. Public gateways are a
 * recovery path for CID-addressed public metadata when the worker's upstream
 * gateway is temporarily rate-limited.
 *
 * Gateway responses are NOT trusted as-is: bytes are re-hashed against the
 * CID before use (see `cidVerify`), so a compromised public gateway cannot
 * substitute content. Responses too large for single-block verification are
 * accepted with a warning — all security-relevant consumers re-verify this
 * JSON against the on-chain Merkle root, which bounds tampering to display
 * spoofing.
 *
 * @module utils/ipfsFetch
 */
import { verifyCidAgainstBytes, readBodyWithLimit } from './cidVerify';
import { fetchIndexerJson } from './indexerClient';
import { warn } from './log';

const MAX_CACHE_ENTRIES = 256;
const PUBLIC_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
    'https://w3s.link/ipfs',
];
const GATEWAY_TIMEOUT_MS = 10_000;
const MAX_GATEWAY_RESPONSE_BYTES = 8 * 1024 * 1024;

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

        const bytes = await readBodyWithLimit(response, MAX_GATEWAY_RESPONSE_BYTES);
        const verification = await verifyCidAgainstBytes(cid, bytes);
        if (verification === 'mismatch') {
            throw new Error('content hash does not match CID');
        }
        if (verification === 'unverifiable') {
            warn(`[IPFS] Unverifiable gateway response accepted for ${cid} via ${gateway}`);
        }

        return JSON.parse(new TextDecoder().decode(bytes)) as T;
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

/**
 * Fetch ONLY the `emailHashes` of a distribution document via the indexer's
 * extraction route, avoiding the full (potentially multi-MB) JSON download
 * that eligibility filtering would otherwise pay per distribution.
 *
 * Returns `null` when the document has no email gating. Throws when the
 * route is unavailable (e.g. an older indexer deployment) so callers can
 * fall back to the full-document path.
 */
export async function fetchIpfsEmailHashes(cid: string): Promise<string[] | null> {
    const validCid = validateCid(cid);
    const cacheKey = `email-hashes:${validCid}`;
    const cached = getCached<string[] | null>(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const indexed = await fetchIndexerJson<{ emailHashes: string[] | null }>(
        `/v1/ipfs/${encodeURIComponent(validCid)}/email-hashes`,
    );
    const emailHashes = Array.isArray(indexed.emailHashes) ? indexed.emailHashes : null;
    setCached(cacheKey, emailHashes);
    return emailHashes;
}

export function clearIpfsCache(): void {
    cache.clear();
}
