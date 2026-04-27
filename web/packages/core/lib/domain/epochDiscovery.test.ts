import { describe, expect, it } from 'vitest';
import type { DistributionData } from '../services/distribution';
import {
    discoverEpochs,
    buildCommitmentLookup,
    lookupCommitment,
    type DiscoveryCryptoDeps,
    type DiscoveryDataDeps,
} from './epochDiscovery';

const padded = (n: number) => '0x' + n.toString(16).padStart(64, '0');

const fakeSchedule = { vestingStart: 0, cliffDuration: 0, vestingDuration: 0, vestingPeriod: 0 };

const meta = (idx: number, amount: string, unlockTime: number) => ({ index: idx, amount, unlockTime });

// ──────────────────────────────────────────────────────────────────────────
// buildCommitmentLookup / lookupCommitment
// ──────────────────────────────────────────────────────────────────────────

describe('buildCommitmentLookup + lookupCommitment', () => {
    it('matches both padded and unpadded keys', () => {
        const dist: DistributionData['commitments'] = {
            [padded(0xabc)]: meta(0, '100', 0),  // padded form
            '0xdead':       meta(1, '200', 0),  // unpadded form
        };
        const map = buildCommitmentLookup(dist);

        // padded → padded entry
        expect(lookupCommitment(map, padded(0xabc))?.amount).toBe('100');
        // padded query → unpadded stored entry: lookupCommitment strips leading zeros
        expect(lookupCommitment(map, padded(0xdead))?.amount).toBe('200');
    });

    it('returns undefined for unknown commitments', () => {
        const map = buildCommitmentLookup({ [padded(0xabc)]: meta(0, '100', 0) });
        expect(lookupCommitment(map, padded(0xdef))).toBeUndefined();
    });
});

// ──────────────────────────────────────────────────────────────────────────
// discoverEpochs
//
// Strategy: model the hash chain as integer increments so we can predict
// every commitment without real Pedersen WASM. The keys in the fake
// distribution match the integers the fake crypto deps will produce.
// ──────────────────────────────────────────────────────────────────────────

const fakeCrypto: DiscoveryCryptoDeps = {
    stringToBytes: (s) => new Uint8Array(s.split('').map((c) => c.charCodeAt(0))),
    pedersenHashBytes: async (bytes) => BigInt(bytes.reduce((a, b) => a + b, 0)) + 1n,  // start at sum+1
    pedersenHashField:  async (n) => n + 1n,                                            // walk by +1
    computeIdentityCommitment: async (_email, secret) => BigInt(secret),                // identity, drops email
};

function fakeData(commitments: DistributionData['commitments'], claimedSet: Set<string> = new Set()): DiscoveryDataDeps {
    return {
        fetchDistribution: async () => ({
            merkleRoot: '0xroot',
            schedule: fakeSchedule,
            commitments,
        }),
        isEpochClaimed: async (commitment) => claimedSet.has(commitment.toLowerCase()),
    };
}

describe('discoverEpochs', () => {
    it('walks the chain and stops at the first missing commitment', async () => {
        // PIN 'A' → bytes [65] → pedersenHashBytes → 66. So secret_0 = 66, secret_1 = 67, secret_2 = 68 …
        const commitments: DistributionData['commitments'] = {
            [padded(66)]: meta(0, '100', 0),
            [padded(67)]: meta(1, '200', 0),
            [padded(68)]: meta(2, '300', 0),
            // gap at 69 → discovery stops here
            [padded(70)]: meta(4, '500', 0), // never reached
        };

        const result = await discoverEpochs(
            { email: 'a@b.co', pin: 'A', contractAddress: '0xv', nowSeconds: () => 0 },
            fakeCrypto,
            fakeData(commitments),
        );
        expect(result.epochs).toHaveLength(3);
        expect(result.epochs.map(e => e.amount)).toEqual([100n, 200n, 300n]);
        expect(result.epochs.map(e => e.leafIndex)).toEqual([0, 1, 2]);
    });

    it('throws "No allocation found" when the very first commitment is absent (wrong PIN/email)', async () => {
        const commitments: DistributionData['commitments'] = { [padded(999)]: meta(0, '100', 0) };
        await expect(discoverEpochs(
            { email: 'x@y.z', pin: 'A', contractAddress: '0xv', nowSeconds: () => 0 },
            fakeCrypto,
            fakeData(commitments),
        )).rejects.toThrow(/No allocation found/);
    });

    it('treats an isEpochClaimed failure as "not claimed" and continues', async () => {
        const commitments: DistributionData['commitments'] = { [padded(66)]: meta(0, '100', 0) };
        const flakyData: DiscoveryDataDeps = {
            fetchDistribution: async () => ({ merkleRoot: '0x', schedule: fakeSchedule, commitments }),
            isEpochClaimed: async () => { throw new Error('RPC down'); },
        };
        const result = await discoverEpochs(
            { email: 'a@b.co', pin: 'A', contractAddress: '0xv', nowSeconds: () => 0 },
            fakeCrypto,
            flakyData,
        );
        expect(result.epochs[0].isClaimed).toBe(false);
    });

    it('marks isLocked / canClaim relative to the injected clock', async () => {
        const commitments: DistributionData['commitments'] = {
            [padded(66)]: meta(0, '100', 1000),  // unlock at t=1000
            [padded(67)]: meta(1, '200', 2000),  // unlock at t=2000
        };
        const result = await discoverEpochs(
            { email: 'a@b.co', pin: 'A', contractAddress: '0xv', nowSeconds: () => 1500 },
            fakeCrypto,
            fakeData(commitments),
        );
        // first epoch is unlocked + claimable; second is locked
        expect(result.epochs[0].isLocked).toBe(false);
        expect(result.epochs[0].canClaim).toBe(true);
        expect(result.epochs[1].isLocked).toBe(true);
        expect(result.epochs[1].canClaim).toBe(false);
    });

    it('honors a tighter maxEpochs cap', async () => {
        // Build 5 sequential commitments
        const commitments: DistributionData['commitments'] = {};
        for (let i = 0; i < 5; i++) commitments[padded(66 + i)] = meta(i, '1', 0);

        const result = await discoverEpochs(
            { email: 'a@b.co', pin: 'A', contractAddress: '0xv', nowSeconds: () => 0, maxEpochs: 3 },
            fakeCrypto,
            fakeData(commitments),
        );
        expect(result.epochs).toHaveLength(3);
    });

    it('reflects on-chain claimed status from isEpochClaimed', async () => {
        const commitments: DistributionData['commitments'] = {
            [padded(66)]: meta(0, '100', 0),
            [padded(67)]: meta(1, '200', 0),
        };
        const claimed = new Set([padded(66).toLowerCase()]);
        const result = await discoverEpochs(
            { email: 'a@b.co', pin: 'A', contractAddress: '0xv', nowSeconds: () => 1000 },
            fakeCrypto,
            fakeData(commitments, claimed),
        );
        expect(result.epochs[0].isClaimed).toBe(true);
        expect(result.epochs[0].canClaim).toBe(false);
        expect(result.epochs[1].isClaimed).toBe(false);
    });
});
