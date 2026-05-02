/**
 * Vesting Discovery — claim app side.
 *
 * The factory contract is itself a registry: `getDeploymentCount()` plus
 * `deployments(i)` enumerates every vesting it has ever deployed, and
 * `vestingMetadataCid(addr)` returns the IPFS CID for a single vesting.
 * Everything is read via direct `eth_call` — no `eth_getLogs` scans.
 *
 * Pure read — no chain writes, no backend, no auth.
 *
 * @module services/vestingDiscovery
 */

import {
    createPublicClient,
    http,
    type Address,
    type Chain,
    type PublicClient,
} from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { ZarfVestingFactoryABI } from '../contracts/abis/ZarfVestingFactory';
import { getActiveChainId, getFactoryAddress as getFactoryAddressForChain } from '../config/contracts';
import { __registerCoreConfigResetterForTests, getCoreConfig } from '../config/runtime';

export interface DiscoveredVesting {
    address: Address;
}

const SUPPORTED_CHAINS: Record<number, Chain> = {
    [sepolia.id]: sepolia,
    [mainnet.id]: mainnet,
};

const DEFAULT_RPC_URLS: Record<number, string> = {
    [sepolia.id]: 'https://ethereum-sepolia-rpc.publicnode.com',
    [mainnet.id]: 'https://ethereum-rpc.publicnode.com',
};

const _publicClients = new Map<number, PublicClient>();

function getChain(chainId: number): Chain {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported vesting discovery chain id: ${chainId}`);
    }
    return chain;
}

function getRpcUrl(chainId: number): string {
    return (
        getCoreConfig().rpcUrls[chainId] ||
        DEFAULT_RPC_URLS[chainId] ||
        getChain(chainId).rpcUrls.default.http[0]
    );
}

function publicClient(chainId: number) {
    let client = _publicClients.get(chainId);
    if (!client) {
        client = createPublicClient({
            chain: getChain(chainId),
            transport: http(getRpcUrl(chainId)),
        });
        _publicClients.set(chainId, client);
    }
    return client;
}

/**
 * Enumerate every vesting deployed by the configured factory by reading the
 * factory's on-chain registry: one `getDeploymentCount` call followed by a
 * single multicall that fans out `deployments(i)` for `i in [0, count)`.
 */
export async function discoverAllVestings(
    chainId: number = getActiveChainId(),
): Promise<DiscoveredVesting[]> {
    const factory = getFactoryAddressForChain(chainId);
    if (!factory) {
        console.warn(`[VestingDiscovery] Factory address not configured for chain ${chainId} (configureCore)`);
        return [];
    }

    const client = publicClient(chainId);

    let count: bigint;
    try {
        count = (await client.readContract({
            address: factory,
            abi: ZarfVestingFactoryABI,
            functionName: 'getDeploymentCount',
        })) as bigint;
    } catch (err) {
        console.warn('[VestingDiscovery] getDeploymentCount failed', err);
        return [];
    }

    const total = Number(count);
    if (total === 0) return [];

    const results = await client.multicall({
        // Viem's multicall type rejects this ABI because the constructor entry
        // omits `stateMutability` — cast through unknown.
        contracts: Array.from({ length: total }, (_, i) => ({
            address: factory,
            abi: ZarfVestingFactoryABI,
            functionName: 'deployments',
            args: [BigInt(i)],
        })) as unknown as Parameters<typeof client.multicall>[0]['contracts'],
        allowFailure: true,
    });

    const out: DiscoveredVesting[] = [];
    for (const r of results) {
        if (r.status === 'success' && typeof r.result === 'string') {
            out.push({ address: r.result as Address });
        }
    }
    return out;
}

/**
 * Look up the `metadataCid` for a single vesting by reading the factory's
 * `vestingMetadataCid(addr)` mapping. One `eth_call`, no logs.
 */
export async function getCidForVesting(
    address: Address,
    chainId: number = getActiveChainId(),
): Promise<string | null> {
    const factory = getFactoryAddressForChain(chainId);
    if (!factory) return null;

    try {
        const cid = (await publicClient(chainId).readContract({
            address: factory,
            abi: ZarfVestingFactoryABI,
            functionName: 'vestingMetadataCid',
            args: [address],
        })) as string;
        return cid.length > 0 ? cid : null;
    } catch (err) {
        console.warn('[VestingDiscovery] vestingMetadataCid read failed', err);
        return null;
    }
}

export function __resetVestingDiscoveryForTests(): void {
    _publicClients.clear();
}

__registerCoreConfigResetterForTests(__resetVestingDiscoveryForTests);
