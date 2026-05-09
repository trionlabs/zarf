/**
 * Distribution discovery service for Stellar/Soroban factory deployments.
 */

import type { StellarAddress, StellarContractId } from '../types';
import { getActiveStellarNetworkId } from '../config/runtime';
import {
    getCidForVesting,
    getOwnerDeployment,
    getOwnerDeploymentCount as readOwnerDeploymentCount,
    readVestingContract,
} from '../contracts/contracts';

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
    const count = await readOwnerDeploymentCount(owner);
    if (count === 0) return [];

    return Promise.all(
        Array.from({ length: count }, (_, i) => getOwnerDeployment(owner, i)),
    );
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
        const metadata = await readVestingContract(contractAddress);
        const metadataCid = await getCidForVesting(contractAddress);
        return {
            address: contractAddress,
            name: sanitizeString(metadata.name || 'Unknown Distribution', 50),
            description: sanitizeString(metadata.description || '', 200),
            token: metadata.token,
            tokenSymbol: sanitizeString(metadata.tokenSymbol || 'XLM', 10),
            tokenDecimals: metadata.tokenDecimals,
            owner: metadata.owner,
            vestingStart: 0n,
            cliffDuration: 0n,
            vestingDuration: 0n,
            vestingPeriod: 0n,
            tokenBalance: 0n,
            metadataCid,
        };
    } catch (error) {
        console.error(`[DiscoveryService] Failed to fetch metadata for ${contractAddress}:`, error);
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

    const addresses = await fetchOwnerDeploymentAddresses(owner);
    const addressesToFetch = addresses.slice(0, maxContracts);
    const metadataResults = await Promise.all(
        addressesToFetch.map((addr) => fetchContractMetadata(addr)),
    );
    const contracts = metadataResults.filter(
        (c): c is OnChainVestingContract => c !== null,
    );

    const result = {
        contracts,
        total: addresses.length,
        fetchedAt: Date.now(),
    };
    setCacheResult(owner, result);
    return result;
}

export async function getOwnerDeploymentCount(owner: StellarAddress): Promise<number> {
    return readOwnerDeploymentCount(owner);
}

export function __resetDistributionDiscoveryForTests(): void {
    cache.clear();
}
