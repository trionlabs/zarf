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
} from 'viem';
import { sepolia } from 'viem/chains';
import { ZarfVestingFactoryABI } from '../contracts/abis/ZarfVestingFactory';
import { getCoreConfig } from '../config/runtime';

export interface DiscoveredVesting {
    address: Address;
}

function getRpcUrl(): string {
    return (
        getCoreConfig().rpcUrls[sepolia.id] ||
        'https://ethereum-sepolia-rpc.publicnode.com'
    );
}

function getFactoryAddress(): Address | null {
    return getCoreConfig().factoryAddresses[sepolia.id] ?? null;
}

function publicClient() {
    return createPublicClient({ chain: sepolia, transport: http(getRpcUrl()) });
}

/**
 * Enumerate every vesting deployed by the configured factory by reading the
 * factory's on-chain registry: one `getDeploymentCount` call followed by a
 * single multicall that fans out `deployments(i)` for `i in [0, count)`.
 */
export async function discoverAllVestings(): Promise<DiscoveredVesting[]> {
    const factory = getFactoryAddress();
    if (!factory) {
        console.warn('[VestingDiscovery] Sepolia factory address not configured (configureCore)');
        return [];
    }

    const client = publicClient();

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
export async function getCidForVesting(address: Address): Promise<string | null> {
    const factory = getFactoryAddress();
    if (!factory) return null;

    try {
        const cid = (await publicClient().readContract({
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
