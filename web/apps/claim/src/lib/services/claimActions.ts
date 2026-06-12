/**
 * Async actions that drive the claim flow.
 *
 * Kept separate from `claimStore.svelte.ts` so the store stays a pure-sync
 * state container with no `@zarf/core/contracts` import. The contracts edge
 * is the eager-graph chokepoint for `stellar-vendor`; isolating it here is
 * a prerequisite for the dynamic import in step-4 C2.
 */

import { fetchDistributionData } from '@zarf/core/services/distribution';
import { IpfsFetchError } from '@zarf/core/utils/ipfsFetch';
import { toMessage } from '@zarf/core/utils/error';
import { err } from '@zarf/core/utils/log';
import { discoverEpochs as discoverEpochsCore } from '@zarf/core/domain/epochDiscovery';

import { claimStore, type EpochClaim } from '../stores/claimStore.svelte';

/**
 * Off-chain epoch discovery via the recursive hash chain.
 * The actual algorithm lives in @zarf/core/domain/epochDiscovery (pure,
 * unit-tested). This function wires up Svelte concerns: WASM lazy-load,
 * status messages, error toasts, and the post-success transition.
 */
export async function discoverEpochs(
    email: string,
    jwt: string,
    pin: string,
    contractAddress: string,
): Promise<void> {
    claimStore.state.loading = true;
    claimStore.state.error = null;
    claimStore.state.statusMessage = 'Loading distribution data...';
    claimStore.state.epochs = [];

    try {
        const { areEpochsClaimed, readVestingContract } = await import('@zarf/core/contracts');
        const metadata = await readVestingContract(contractAddress);
        claimStore.state.tokenSymbol = metadata.tokenSymbol;
        claimStore.state.tokenDecimals = metadata.tokenDecimals;

        const { computeIdentityCommitment, stringToBytes, pedersenHashBytes, pedersenHashField } =
            await claimStore.preloadCrypto();

        const result = await discoverEpochsCore(
            { email, pin, contractAddress },
            { computeIdentityCommitment, stringToBytes, pedersenHashBytes, pedersenHashField },
            {
                fetchDistribution: fetchDistributionData,
                areEpochsClaimed,
            },
        );

        claimStore.setSchedule(result.schedule);
        const found: EpochClaim[] = result.epochs.map((e) => ({
            email,
            amount: e.amount,
            salt: e.salt,
            identityCommitment: e.identityCommitment,
            leafIndex: e.leafIndex,
            leaf: 0n,
            unlockTime: e.unlockTime,
            isClaimed: e.isClaimed,
            isLocked: e.isLocked,
            canClaim: e.canClaim,
        }));

        claimStore.setCredentials(email, '', pin);
        claimStore.state.jwt = jwt;
        claimStore.setEpochs(found);
        claimStore.nextStep();
    } catch (e: unknown) {
        err('Discovery failed:', e);
        let msg = toMessage(e, 'Failed to discover epochs.');
        if (msg.includes('404')) msg = 'Contract distribution data not found.';
        if (e instanceof IpfsFetchError) {
            msg =
                e.code === 'INVALID_CID'
                    ? 'This distribution is registered with invalid IPFS metadata. Ask the creator to redeploy it with a real IPFS CID.'
                    : 'Could not load this distribution from IPFS. Please retry; the configured gateway may be unavailable.';
        }
        claimStore.setError(msg);
        throw new Error(msg, { cause: e });
    } finally {
        claimStore.state.loading = false;
        claimStore.state.statusMessage = null;
    }
}
