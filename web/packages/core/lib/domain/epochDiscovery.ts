/**
 * Off-chain epoch discovery via the recursive hash chain.
 *
 * SECURITY-CRITICAL: this loop walks the hash chain (PIN → bytes →
 * pedersen → repeated pedersen) and looks each commitment up in the
 * static distribution map. The hashing MUST match the on-chain Noir
 * circuit exactly — a divergence shows up as "no allocation found"
 * from a user's perspective.
 *
 * Pulled out of `apps/claim/src/lib/stores/claimStore.svelte.ts` so the
 * algorithm is testable in vitest with fake crypto/fetcher/on-chain
 * dependencies.
 *
 * @module domain/epochDiscovery
 */

import type { DistributionData, CommitmentMetadata, EpochMetadata } from '../services/distribution';
import { warn } from '../utils/log';

/** Subset of @zarf/core/crypto/merkleTree the discovery loop calls. Inject for testing. */
export interface DiscoveryCryptoDeps {
    stringToBytes: (str: string) => Uint8Array;
    pedersenHashBytes: (bytes: Uint8Array) => Promise<bigint>;
    pedersenHashField: (field: bigint) => Promise<bigint>;
    computeIdentityCommitment: (email: string, code: string | bigint) => Promise<bigint>;
}

export interface DiscoveryDataDeps {
    fetchDistribution: (contractAddress: string) => Promise<DistributionData>;
    /** Returns true if the on-chain epoch is already claimed. Failures should NOT abort discovery. */
    isEpochClaimed: (commitment: string, contractAddress: string) => Promise<boolean>;
}

export interface DiscoveredEpoch {
    /** 0x-prefixed, 64-hex (32-byte) commitment, lowercased. */
    identityCommitment: string;
    /** Hex-string secret for circuit input (`'0x' + bigint.toString(16)`, NOT padded). */
    salt: string;
    amount: bigint;
    /** Leaf index from the static distribution data (matches on-chain merkle tree). */
    leafIndex: number;
    /** Unix seconds for this epoch's unlock. */
    unlockTime: number;
    isClaimed: boolean;
    isLocked: boolean;
    canClaim: boolean;
}

export interface DiscoveryResult {
    schedule: DistributionData['schedule'];
    epochs: DiscoveredEpoch[];
}

/** Default safety cap on the discovery loop. Beyond this, we assume something's wrong. */
export const MAX_EPOCHS = 200;

/**
 * Build the lookup map from the distribution's commitments. We index by
 * lowercased key AND by an unpadded variant ('0x' + leading-zero-stripped),
 * because in older distribution files the keys may not be 32-byte padded.
 */
export function buildCommitmentLookup(
    commitments: DistributionData['commitments'],
): Record<string, EpochMetadata[]> {
    const out: Record<string, EpochMetadata[]> = {};
    const append = (key: string, metadata: CommitmentMetadata) => {
        const values = Array.isArray(metadata) ? metadata : [metadata];
        out[key] = [...(out[key] ?? []), ...values];
    };

    for (const [key, val] of Object.entries(commitments)) {
        const lower = key.toLowerCase();
        append(lower, val);
        const unpadded = '0x' + key.slice(2).replace(/^0+/, '').toLowerCase();
        if (unpadded !== lower) append(unpadded, val);
    }
    return out;
}

/**
 * Look up a commitment in the lookup map, trying both padded and unpadded
 * forms. Returns the matched metadata or undefined.
 */
export function lookupCommitment(
    map: Record<string, EpochMetadata[]>,
    paddedCommitment: string,
): EpochMetadata[] | undefined {
    const lower = paddedCommitment.toLowerCase();
    const direct = map[lower];
    if (direct) return direct;
    const unpadded = '0x' + paddedCommitment.slice(2).replace(/^0+/, '').toLowerCase();
    return map[unpadded];
}

export interface DiscoverEpochsParams {
    email: string;
    pin: string;
    contractAddress: string;
    /** Defaults to `Date.now() / 1000` (real wall clock). Inject for testing. */
    nowSeconds?: () => number;
    /** Safety cap on the loop. Defaults to MAX_EPOCHS. */
    maxEpochs?: number;
}

/**
 * Walk the recursive hash chain to discover all epochs the user is
 * entitled to in this distribution.
 *
 * Algorithm:
 *   secret_0 = pedersenHashBytes(stringToBytes(PIN))
 *   secret_i = pedersenHashField(secret_{i-1})        for i > 0
 *   commitment_i = computeIdentityCommitment(email, secret_i)
 *   stop on the first miss; throw if no epochs found at all
 *
 * @throws if no epochs found at all (likely wrong email/PIN).
 */
export async function discoverEpochs(
    params: DiscoverEpochsParams,
    crypto: DiscoveryCryptoDeps,
    data: DiscoveryDataDeps,
): Promise<DiscoveryResult> {
    const { email, pin, contractAddress } = params;
    const nowSeconds = params.nowSeconds ?? (() => Date.now() / 1000);
    const maxEpochs = params.maxEpochs ?? MAX_EPOCHS;

    const distribution = await data.fetchDistribution(contractAddress);
    const lookup = buildCommitmentLookup(distribution.commitments);

    const epochs: DiscoveredEpoch[] = [];
    let currentSecret = await crypto.pedersenHashBytes(crypto.stringToBytes(pin));

    for (let index = 0; index < maxEpochs; index++) {
        if (index > 0) currentSecret = await crypto.pedersenHashField(currentSecret);

        const commitmentBigInt = await crypto.computeIdentityCommitment(email, currentSecret);
        const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');
        const metas = lookupCommitment(lookup, commitment);
        if (!metas || metas.length === 0) break;

        let isClaimed = false;
        try {
            isClaimed = await data.isEpochClaimed(commitment, contractAddress);
        } catch (e) {
            // On-chain status check failures should not abort discovery; treat as unclaimed.
            warn(`[Discovery] Status check failed for epoch ${index}`, e);
        }

        const now = nowSeconds();
        for (const meta of metas) {
            epochs.push({
                identityCommitment: commitment,
                salt: '0x' + currentSecret.toString(16),
                amount: BigInt(meta.amount),
                leafIndex: meta.index,
                unlockTime: meta.unlockTime,
                isClaimed,
                isLocked: now < meta.unlockTime,
                canClaim: !isClaimed && now >= meta.unlockTime,
            });
        }
    }

    if (epochs.length === 0) {
        throw new Error('No allocation found. Please check your Email and PIN.');
    }

    return { schedule: distribution.schedule, epochs };
}
