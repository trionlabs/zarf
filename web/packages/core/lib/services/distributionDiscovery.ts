/**
 * Distribution discovery service for Stellar/Soroban factory deployments.
 */

import type { StellarAddress, StellarContractId } from '../types';
import { getActiveStellarNetworkId } from '../config/runtime';
import {
    fetchIndexerJson,
    indexerNetworkPath,
} from '../utils/indexerClient';
import { warn } from '../utils/log';

export interface OnChainVestingContract {
    address: StellarContractId;
    name: string;
    description: string;
    token: StellarContractId;
    tokenSymbol: string;
    tokenDecimals: number;
    owner: StellarAddress;
    vestingStart: bigint;
    cliffDuration: bigint;
    vestingDuration: bigint;
    vestingPeriod: bigint;
    tokenBalance: bigint;
    metadataCid: string | null;
}

export interface DiscoveryResult {
    contracts: OnChainVestingContract[];
    total: number;
    fetchedAt: number;
}

export interface DiscoveryError {
    code: 'RPC_ERROR' | 'NO_FACTORY' | 'PARTIAL_FAILURE';
    message: string;
    failedAddresses?: StellarContractId[];
}

interface IndexerVestingContract {
    address: StellarContractId;
    name: string;
    description: string;
    token: StellarContractId;
    tokenSymbol: string;
    tokenDecimals: number;
    owner: StellarAddress;
    vestingStart: string;
    cliffDuration: string;
    vestingDuration: string;
    vestingPeriod: string;
    tokenBalance: string;
    metadataCid: string | null;
}

interface IndexerDiscoveryResult {
    contracts: IndexerVestingContract[];
    total: number;
    fetchedAt: number;
}

interface CacheEntry {
    data: DiscoveryResult;
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(owner: StellarAddress): string {
    return `${getActiveStellarNetworkId()}:${owner}`;
}

function getCachedResult(owner: StellarAddress): DiscoveryResult | null {
    const entry = cache.get(cacheKey(owner));
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(cacheKey(owner));
        return null;
    }

    return entry.data;
}

function setCacheResult(owner: StellarAddress, result: DiscoveryResult): void {
    cache.set(cacheKey(owner), {
        data: result,
        timestamp: Date.now(),
    });
}

function fromIndexerContract(contract: IndexerVestingContract): OnChainVestingContract {
    return {
        ...contract,
        vestingStart: BigInt(contract.vestingStart),
        cliffDuration: BigInt(contract.cliffDuration),
        vestingDuration: BigInt(contract.vestingDuration),
        vestingPeriod: BigInt(contract.vestingPeriod),
        tokenBalance: BigInt(contract.tokenBalance),
    };
}

function fromIndexerDiscovery(result: IndexerDiscoveryResult): DiscoveryResult {
    return {
        contracts: result.contracts.map(fromIndexerContract),
        total: result.total,
        fetchedAt: result.fetchedAt,
    };
}

export function invalidateCache(owner?: StellarAddress): void {
    if (!owner) {
        cache.clear();
        return;
    }
    cache.delete(cacheKey(owner));
}

export function addOptimisticContract(
    owner: StellarAddress,
    contract: OnChainVestingContract,
): void {
    const cached = getCachedResult(owner);
    const currentContracts = cached ? cached.contracts : [];
    const uniqueContracts = Array.from(
        new Map([contract, ...currentContracts].map((c) => [c.address, c])).values(),
    );

    setCacheResult(owner, {
        contracts: uniqueContracts,
        total: uniqueContracts.length,
        fetchedAt: Date.now(),
    });
}

export async function fetchOwnerDeploymentAddresses(
    owner: StellarAddress,
): Promise<StellarContractId[]> {
    const indexed = await fetchIndexerJson<IndexerDiscoveryResult>(
        indexerNetworkPath(`/owners/${encodeURIComponent(owner)}/vestings`),
    );
    return indexed.contracts.map((contract) => contract.address);
}

export function sanitizeString(str: string, maxLength: number): string {
    if (!str) return '';
    const clean = str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    return clean.length > maxLength ? clean.substring(0, maxLength) : clean;
}

export async function fetchContractMetadata(
    contractAddress: StellarContractId,
): Promise<OnChainVestingContract | null> {
    try {
        const indexed = await fetchIndexerJson<IndexerVestingContract>(
            indexerNetworkPath(`/vestings/${encodeURIComponent(contractAddress)}`),
        );
        return fromIndexerContract(indexed);
    } catch (error) {
        warn('[DiscoveryService] Indexer metadata read failed:', error);
        return null;
    }
}

export async function discoverOwnerVestings(
    owner: StellarAddress,
    options: {
        forceRefresh?: boolean;
        maxContracts?: number;
    } = {},
): Promise<DiscoveryResult> {
    const { forceRefresh = false, maxContracts = 50 } = options;

    if (!forceRefresh) {
        const cached = getCachedResult(owner);
        if (cached) return cached;
    }

    const indexed = await fetchIndexerJson<IndexerDiscoveryResult>(
        indexerNetworkPath(`/owners/${encodeURIComponent(owner)}/vestings`),
        {
            maxContracts,
            refresh: forceRefresh || undefined,
        },
    );
    const result = fromIndexerDiscovery(indexed);
    setCacheResult(owner, result);
    return result;
}

export async function getOwnerDeploymentCount(owner: StellarAddress): Promise<number> {
    const indexed = await fetchIndexerJson<IndexerDiscoveryResult>(
        indexerNetworkPath(`/owners/${encodeURIComponent(owner)}/vestings`),
    );
    return indexed.total;
}

export function __resetDistributionDiscoveryForTests(): void {
    cache.clear();
}
