/**
 * Distribution Discovery Service
 * 
 * Fetches deployed vesting contracts directly from the blockchain (Factory Registry).
 * Implements RPC-based discovery for zero-backend architecture.
 * 
 * @module services/distributionDiscovery
 */

import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import { ZarfVestingFactoryABI } from '$lib/contracts/abis/ZarfVestingFactory';
import { ZarfVestingABI } from '$lib/contracts/abis/ZarfVesting';
import { ERC20ABI } from '$lib/contracts/abis/ERC20';
import { FACTORY_ADDRESS } from '$lib/config/contracts';

// ============ Public Client (Lazy Initialization) ============

let _publicClient: PublicClient | null = null;

function getPublicClient(): PublicClient {
    if (!_publicClient) {
        const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
        _publicClient = createPublicClient({
            chain: sepolia,
            transport: http(rpcUrl)
        });
    }
    return _publicClient;
}

// ============ Types ============

export interface OnChainVestingContract {
    /** Contract address */
    address: Address;
    /** Human-readable name (stored on-chain) */
    name: string;
    /** Description/category (stored on-chain) */
    description: string;
    /** Token address */
    token: Address;
    /** Token symbol */
    tokenSymbol: string;
    /** Token decimals */
    tokenDecimals: number;
    /** Contract owner */
    owner: Address;
    /** Vesting start timestamp (seconds) */
    vestingStart: bigint;
    /** Cliff duration (seconds) */
    cliffDuration: bigint;
    /** Total vesting duration (seconds) */
    vestingDuration: bigint;
    /** Unlock period (seconds) */
    vestingPeriod: bigint;
    /** Token balance in contract */
    tokenBalance: bigint;
}

export interface DiscoveryResult {
    contracts: OnChainVestingContract[];
    total: number;
    fetchedAt: number;
}

export interface DiscoveryError {
    code: 'RPC_ERROR' | 'NO_FACTORY' | 'PARTIAL_FAILURE';
    message: string;
    failedAddresses?: Address[];
}

// ============ Cache ============

interface CacheEntry {
    data: DiscoveryResult;
    timestamp: number;
}

const cache = new Map<Address, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedResult(owner: Address): DiscoveryResult | null {
    const entry = cache.get(owner);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
    if (isExpired) {
        cache.delete(owner);
        return null;
    }

    return entry.data;
}

function setCacheResult(owner: Address, result: DiscoveryResult): void {
    cache.set(owner, {
        data: result,
        timestamp: Date.now()
    });
}

export function invalidateCache(owner?: Address): void {
    if (owner) {
        cache.delete(owner);
    } else {
        cache.clear();
    }
}

/**
 * Manually add a contract to the cache (Optimistic UI)
 * Call this immediately after a successful deployment
 */
export function addOptimisticContract(owner: Address, contract: OnChainVestingContract): void {
    const cached = getCachedResult(owner);

    // Create new result based on cache or empty state
    const currentContracts = cached ? cached.contracts : [];
    const newContracts = [contract, ...currentContracts];

    // Deduplicate by address
    const uniqueContracts = Array.from(new Map(newContracts.map(c => [c.address, c])).values());

    const newResult: DiscoveryResult = {
        contracts: uniqueContracts,
        total: uniqueContracts.length,
        fetchedAt: Date.now()
    };

    setCacheResult(owner, newResult);
    console.log('[DiscoveryService] Optimistically added contract:', contract.address);
}

// ============ Discovery Functions ============

/**
 * Fetch all vesting contract addresses deployed by a specific owner
 * @param owner Wallet address of the owner
 * @returns Array of contract addresses
 */
export async function fetchOwnerDeploymentAddresses(owner: Address): Promise<Address[]> {
    const client = getPublicClient();

    if (!FACTORY_ADDRESS) {
        throw new Error('Factory address not configured');
    }

    try {
        const addresses = await client.readContract({
            address: FACTORY_ADDRESS as Address,
            abi: ZarfVestingFactoryABI,
            functionName: 'getOwnerDeployments',
            args: [owner]
        }) as Address[];

        return addresses;
    } catch (error) {
        console.error('[DiscoveryService] Failed to fetch owner deployments:', error);
        throw {
            code: 'RPC_ERROR',
            message: 'Failed to fetch deployments from Factory'
        } as DiscoveryError;
    }
}

/**
 * Fetch metadata for a single vesting contract
 * @param contractAddress Vesting contract address
 * @returns Contract metadata or null if failed
 */
/**
 * Sanitize and truncate strings from untrusted on-chain sources
 * Prevents UI breakage and basic injection attempts
 */
function sanitizeString(str: string, maxLength: number): string {
    if (!str) return '';
    // Remove control characters and non-printable chars
    let clean = str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    // Truncate
    if (clean.length > maxLength) {
        clean = clean.substring(0, maxLength);
    }
    return clean;
}

export async function fetchContractMetadata(
    contractAddress: Address
): Promise<OnChainVestingContract | null> {
    const client = getPublicClient();

    try {
        // Batch read all contract data using Multicall (allowFailure: true for resilience)
        const results = await client.multicall({
            contracts: [
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'name'
                },
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'description'
                },
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'token'
                },
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'owner'
                },
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'vestingStart'
                },
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'cliffDuration'
                },
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'vestingDuration'
                },
                {
                    address: contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'vestingPeriod'
                }
            ],
            allowFailure: true // Resilience: don't crash on single call failure
        });

        // Check if any critical calls failed
        const hasCriticalFailure = results.slice(0, 4).some(r => r.status === 'failure');
        if (hasCriticalFailure) {
            console.warn(`[DiscoveryService] Critical metadata fetch failed for ${contractAddress}`);
            return null;
        }

        // Sanitize strings immediately
        const name = sanitizeString(
            results[0].status === 'success' ? results[0].result as string : 'Unknown Distribution',
            50 // Max 50 chars for name
        );

        const description = sanitizeString(
            results[1].status === 'success' ? results[1].result as string : '',
            200 // Max 200 chars for description
        );

        const tokenAddress = results[2].result as Address;
        const owner = results[3].result as Address;
        const vestingStart = results[4].status === 'success' ? results[4].result as bigint : 0n;
        const cliffDuration = results[5].status === 'success' ? results[5].result as bigint : 0n;
        const vestingDuration = results[6].status === 'success' ? results[6].result as bigint : 0n;
        const vestingPeriod = results[7].status === 'success' ? results[7].result as bigint : 0n;

        // Fetch token metadata (also with resilience)
        const tokenResults = await client.multicall({
            contracts: [
                {
                    address: tokenAddress,
                    abi: ERC20ABI,
                    functionName: 'symbol'
                },
                {
                    address: tokenAddress,
                    abi: ERC20ABI,
                    functionName: 'decimals'
                },
                {
                    address: tokenAddress,
                    abi: ERC20ABI,
                    functionName: 'balanceOf',
                    args: [contractAddress]
                }
            ],
            allowFailure: true // Resilience: handle non-standard tokens
        });

        const tokenSymbol = sanitizeString(
            tokenResults[0].status === 'success' ? tokenResults[0].result as string : '???',
            10 // Max 10 chars for symbol
        );
        const tokenDecimals = tokenResults[1].status === 'success' ? tokenResults[1].result as number : 18;
        const tokenBalance = tokenResults[2].status === 'success' ? tokenResults[2].result as bigint : 0n;

        return {
            address: contractAddress,
            name,
            description,
            token: tokenAddress,
            tokenSymbol,
            tokenDecimals,
            owner,
            vestingStart,
            cliffDuration,
            vestingDuration,
            vestingPeriod,
            tokenBalance
        };
    } catch (error) {
        console.error(`[DiscoveryService] Failed to fetch metadata for ${contractAddress}:`, error);
        return null;
    }
}

/**
 * Fetch all vesting contracts for an owner with full metadata
 * Uses caching to avoid excessive RPC calls
 * 
 * @param owner Wallet address of the owner
 * @param options Discovery options
 * @returns Discovery result with contracts
 */
export async function discoverOwnerVestings(
    owner: Address,
    options: {
        forceRefresh?: boolean;
        maxContracts?: number;
    } = {}
): Promise<DiscoveryResult> {
    const { forceRefresh = false, maxContracts = 50 } = options;

    // Check cache first
    if (!forceRefresh) {
        const cached = getCachedResult(owner);
        if (cached) {
            console.log('[DiscoveryService] Returning cached result');
            return cached;
        }
    }

    // Fetch addresses from Factory
    const addresses = await fetchOwnerDeploymentAddresses(owner);

    if (addresses.length === 0) {
        const result: DiscoveryResult = {
            contracts: [],
            total: 0,
            fetchedAt: Date.now()
        };
        setCacheResult(owner, result);
        return result;
    }

    // Limit to maxContracts for performance
    const addressesToFetch = addresses.slice(0, maxContracts);

    // Fetch metadata for each contract in parallel
    const metadataPromises = addressesToFetch.map(addr => fetchContractMetadata(addr));
    const metadataResults = await Promise.all(metadataPromises);

    // Filter out failed fetches
    const contracts = metadataResults.filter(
        (c): c is OnChainVestingContract => c !== null
    );

    const result: DiscoveryResult = {
        contracts,
        total: addresses.length,
        fetchedAt: Date.now()
    };

    setCacheResult(owner, result);

    return result;
}

/**
 * Get deployment count for an owner (cheaper than full discovery)
 */
export async function getOwnerDeploymentCount(owner: Address): Promise<number> {
    const client = getPublicClient();

    if (!FACTORY_ADDRESS) {
        return 0;
    }

    try {
        const count = await client.readContract({
            address: FACTORY_ADDRESS as Address,
            abi: ZarfVestingFactoryABI,
            functionName: 'getOwnerDeploymentCount',
            args: [owner]
        }) as bigint;

        return Number(count);
    } catch (error) {
        console.error('[DiscoveryService] Failed to get deployment count:', error);
        return 0;
    }
}
