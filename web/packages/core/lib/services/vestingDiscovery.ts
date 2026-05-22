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

export async function discoverAllVestings(): Promise<DiscoveredVesting[]> {
    try {
        const indexed = await fetchIndexerJson<IndexerVestingsResult>(
            indexerNetworkPath('/vestings'),
        );
        return indexed.vestings;
    } catch (error) {
        warn('[VestingDiscovery] Indexer discovery failed:', error);
        return [];
    }
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
