/**
 * Vesting discovery for Stellar/Soroban.
 *
 * The indexer backend reads the factory registry for us. The browser must not
 * fall back to direct RPC here.
 */

import type { StellarContractId } from '../types';
import { fetchIndexerJson, indexerNetworkPath } from '../utils/indexerClient';
import { warn } from '../utils/log';

export interface DiscoveredVesting {
    address: StellarContractId;
    metadataCid?: string | null;
}

interface IndexerVestingsResult {
    vestings: DiscoveredVesting[];
    total: number;
    fetchedAt: number;
}

interface IndexerVestingContract {
    metadataCid: string | null;
}

/**
 * List every registered distribution. Throws on indexer failure — the caller
 * decides the staleness policy (e.g. keep showing a previously fetched list
 * instead of downgrading to empty). `forceRefresh` bypasses the indexer's
 * edge-cache read so a just-deployed distribution shows up immediately.
 */
export async function discoverAllVestings(
    options: { forceRefresh?: boolean } = {},
): Promise<DiscoveredVesting[]> {
    const indexed = await fetchIndexerJson<IndexerVestingsResult>(
        indexerNetworkPath('/vestings'),
        options.forceRefresh ? { refresh: 1 } : {},
    );
    return indexed.vestings;
}

export async function getCidForVesting(address: StellarContractId): Promise<string | null> {
    try {
        const indexed = await fetchIndexerJson<IndexerVestingContract>(
            indexerNetworkPath(`/vestings/${encodeURIComponent(address)}`),
        );
        return indexed.metadataCid;
    } catch (error) {
        warn('[VestingDiscovery] Indexer CID read failed:', error);
        return null;
    }
}

export function __resetVestingDiscoveryForTests(): void {}
