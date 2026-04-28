/**
 * Vesting Discovery — claim app side.
 *
 * Reads VestingCreated events from the factory and surfaces every deployed
 * vesting along with its IPFS metadata CID. Maintains a localStorage cache
 * keyed by chain + factory + lastScannedBlock so subsequent visits do an
 * incremental scan rather than re-reading history from genesis.
 *
 * Pure read — no chain writes, no backend, no auth.
 *
 * @module services/vestingDiscovery
 */

import { createPublicClient, http, parseAbiItem, type Address } from 'viem';
import { sepolia } from 'viem/chains';

const VESTING_CREATED_EVENT = parseAbiItem(
    'event VestingCreated(address indexed vesting, address indexed owner, address indexed token, uint256 totalAmount, uint256 recipientCount, string metadataCid)',
);

export interface DiscoveredVesting {
    address: Address;
    owner: Address;
    token: Address;
    totalAmount: string; // bigint serialized for storage
    recipientCount: number;
    metadataCid: string;
    blockNumber: number;
}

interface CacheShape {
    chainId: number;
    factory: Address;
    lastScannedBlock: number;
    vestings: DiscoveredVesting[];
}

const CACHE_VERSION = 1;

function cacheKey(chainId: number, factory: Address): string {
    return `zarf:vestingDiscovery:v${CACHE_VERSION}:${chainId}:${factory.toLowerCase()}`;
}

function loadCache(chainId: number, factory: Address): CacheShape | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(cacheKey(chainId, factory));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CacheShape;
        if (parsed.chainId !== chainId || parsed.factory.toLowerCase() !== factory.toLowerCase()) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function saveCache(cache: CacheShape): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(cacheKey(cache.chainId, cache.factory), JSON.stringify(cache));
    } catch {
        // localStorage full or unavailable — silently ignore, next load re-scans
    }
}

function getRpcUrl(): string {
    return (
        import.meta.env.VITE_SEPOLIA_RPC_URL ||
        'https://ethereum-sepolia-rpc.publicnode.com'
    );
}

function getFactoryAddress(): Address | null {
    const addr = import.meta.env.VITE_FACTORY_ADDRESS_SEPOLIA as string | undefined;
    return addr ? (addr as Address) : null;
}

function getDeployBlock(): bigint {
    const raw = import.meta.env.VITE_FACTORY_DEPLOY_BLOCK_SEPOLIA as string | undefined;
    if (!raw) return 0n;
    try {
        return BigInt(raw);
    } catch {
        return 0n;
    }
}

function publicClient() {
    return createPublicClient({ chain: sepolia, transport: http(getRpcUrl()) });
}

/**
 * Discover all vestings deployed by the configured factory.
 *
 * Strategy:
 * 1. Read cache (chainId + factory keyed) — if present, scan from lastScannedBlock+1.
 * 2. Otherwise scan from VITE_FACTORY_DEPLOY_BLOCK_SEPOLIA (or 0).
 * 3. Append new events to cached list, save back, return merged.
 *
 * Returns vestings in chronological order (oldest first).
 */
export async function discoverAllVestings(
    opts: { forceRefresh?: boolean } = {},
): Promise<DiscoveredVesting[]> {
    const factory = getFactoryAddress();
    if (!factory) {
        console.warn('[VestingDiscovery] VITE_FACTORY_ADDRESS_SEPOLIA not configured');
        return [];
    }

    const chainId = sepolia.id;
    const client = publicClient();

    const cached = opts.forceRefresh ? null : loadCache(chainId, factory);
    const fromBlock = cached ? BigInt(cached.lastScannedBlock + 1) : getDeployBlock();

    let latestBlock: bigint;
    try {
        latestBlock = await client.getBlockNumber();
    } catch (err) {
        console.warn('[VestingDiscovery] Failed to read latest block, returning cached only', err);
        return cached?.vestings ?? [];
    }

    if (cached && fromBlock > latestBlock) {
        return cached.vestings;
    }

    // Alchemy's free tier caps eth_getLogs at 10 blocks per call.
    // Other providers vary, so we paginate in small windows. CHUNK is the
    // worst-case provider limit; if we ever move to a paid tier we can bump it.
    const CHUNK = 10n;
    const logs: Awaited<ReturnType<typeof client.getLogs>> = [];
    let lastSuccessfulBlock = fromBlock - 1n;
    for (let start = fromBlock; start <= latestBlock; start += CHUNK) {
        const end = start + CHUNK - 1n > latestBlock ? latestBlock : start + CHUNK - 1n;
        try {
            const chunk = await client.getLogs({
                address: factory,
                event: VESTING_CREATED_EVENT,
                fromBlock: start,
                toBlock: end,
            });
            logs.push(...chunk);
            lastSuccessfulBlock = end;
        } catch (err) {
            console.warn(
                `[VestingDiscovery] getLogs failed for blocks [${start}, ${end}]`,
                err,
            );
            // Save progress so far and bail; next run resumes from here
            break;
        }
    }
    const scannedTo = lastSuccessfulBlock < fromBlock ? Number(fromBlock - 1n) : Number(lastSuccessfulBlock);

    const fresh: DiscoveredVesting[] = [];
    for (const log of logs) {
        const args = (log as unknown as { args: Record<string, unknown> }).args;
        if (
            !args ||
            typeof args.vesting !== 'string' ||
            typeof args.metadataCid !== 'string'
        ) {
            continue;
        }
        fresh.push({
            address: args.vesting as Address,
            owner: args.owner as Address,
            token: args.token as Address,
            totalAmount: (args.totalAmount as bigint).toString(),
            recipientCount: Number(args.recipientCount as bigint),
            metadataCid: args.metadataCid,
            blockNumber: Number(log.blockNumber ?? 0n),
        });
    }

    const merged = mergeVestings(cached?.vestings ?? [], fresh);
    saveCache({
        chainId,
        factory,
        lastScannedBlock: scannedTo,
        vestings: merged,
    });

    return merged;
}

function mergeVestings(
    existing: DiscoveredVesting[],
    fresh: DiscoveredVesting[],
): DiscoveredVesting[] {
    const byAddress = new Map<string, DiscoveredVesting>();
    for (const v of existing) byAddress.set(v.address.toLowerCase(), v);
    for (const v of fresh) byAddress.set(v.address.toLowerCase(), v);
    return Array.from(byAddress.values()).sort((a, b) => a.blockNumber - b.blockNumber);
}

/**
 * Look up the metadata CID for a single vesting address.
 * Reads cache first; if missing, performs a discovery pass.
 */
export async function getCidForVesting(address: Address): Promise<string | null> {
    const factory = getFactoryAddress();
    if (!factory) return null;
    const chainId = sepolia.id;
    const cached = loadCache(chainId, factory);
    const lower = address.toLowerCase();
    const findIn = (list: DiscoveredVesting[]) =>
        list.find((v) => v.address.toLowerCase() === lower)?.metadataCid ?? null;

    const cachedHit = cached ? findIn(cached.vestings) : null;
    if (cachedHit) return cachedHit;

    const fresh = await discoverAllVestings();
    return findIn(fresh);
}
