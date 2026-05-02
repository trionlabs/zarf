/**
 * Vesting discovery for Stellar/Soroban.
 *
 * The factory contract is the registry. We read its indexed deployment storage
 * directly through contract simulation.
 */

import type { StellarContractId } from '../types';
import {
    getCidForVesting as getCidForVestingFromFactory,
    getDeployment,
    getDeploymentCount,
} from '../contracts/contracts';

export interface DiscoveredVesting {
    address: StellarContractId;
}

export async function discoverAllVestings(): Promise<DiscoveredVesting[]> {
    const count = await getDeploymentCount();
    if (count === 0) return [];

    const deployments = await Promise.all(
        Array.from({ length: count }, (_, i) => getDeployment(i)),
    );

    return deployments.map((address) => ({ address }));
}

export async function getCidForVesting(
    address: StellarContractId,
): Promise<string | null> {
    return getCidForVestingFromFactory(address);
}

export function __resetVestingDiscoveryForTests(): void {}
