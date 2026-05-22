/**
 * Optional Zarf indexer client.
 *
 * The indexer is a shared read backend for expensive Stellar RPC/IPFS reads.
 * Core keeps it optional so local/dev flows can still fall back to direct
 * public RPC/gateway reads when VITE_INDEXER_URL is not configured.
 */
import { getActiveStellarNetworkId, getCoreConfig } from '../config/runtime';

export class IndexerRequestError extends Error {
    constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'IndexerRequestError';
    }
}

export class IndexerUnavailableError extends Error {
    constructor(message = 'Indexer URL is not configured') {
        super(message);
        this.name = 'IndexerUnavailableError';
    }
}

export function getIndexerBaseUrl(): string | null {
    try {
        const configured = getCoreConfig().indexerUrl?.trim();
        if (!configured) return null;
        return configured.replace(/\/+$/, '');
    } catch {
        return null;
    }
}

export function indexerNetworkPath(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `/v1/${encodeURIComponent(getActiveStellarNetworkId())}${normalizedPath}`;
}

export async function fetchIndexerJson<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
    const base = getIndexerBaseUrl();
    if (!base) throw new IndexerUnavailableError();

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(
        `${base}${normalizedPath}`,
        typeof location === 'undefined' ? 'http://localhost' : location.origin,
    );

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new IndexerRequestError(
            `Indexer request failed: ${response.status}`,
            response.status,
        );
    }

    return (await response.json()) as T;
}
