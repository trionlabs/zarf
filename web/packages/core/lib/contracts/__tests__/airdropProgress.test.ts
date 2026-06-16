import { describe, it, expect } from 'vitest';
import { Address } from '@stellar/stellar-sdk';
import {
    airdropStatusChunks,
    tallyClaimed,
    summarizeAirdropProgress,
    buildWithdrawAirdropArgs,
    MAX_CLAIMED_PAGE,
    type WithdrawAirdropParams,
} from '../contracts';

// Real testnet strkeys: a G-address admin, a second G-address (alternate `to`),
// and a C-address standing in for the airdrop instance.
const ADMIN = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';
const OTHER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const AIRDROP = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';

describe('airdropStatusChunks', () => {
    it('returns no chunks for an empty recipient set', () => {
        expect(airdropStatusChunks(0)).toEqual([]);
    });

    it('returns a single sub-page chunk below the page limit', () => {
        expect(airdropStatusChunks(50)).toEqual([{ start: 0, limit: 50 }]);
    });

    it('returns exactly one full chunk at the page limit', () => {
        expect(airdropStatusChunks(MAX_CLAIMED_PAGE)).toEqual([{ start: 0, limit: 80 }]);
    });

    it('splits past the limit into 80-wide windows with a trailing remainder', () => {
        expect(airdropStatusChunks(81)).toEqual([
            { start: 0, limit: 80 },
            { start: 80, limit: 1 },
        ]);
        expect(airdropStatusChunks(200)).toEqual([
            { start: 0, limit: 80 },
            { start: 80, limit: 80 },
            { start: 160, limit: 40 },
        ]);
    });

    it('never emits a window wider than the contract page limit', () => {
        for (const { limit } of airdropStatusChunks(1000)) expect(limit).toBeLessThanOrEqual(80);
    });
});

describe('tallyClaimed', () => {
    it('counts set bits within the recipient range', () => {
        const { claimedCount, claimedAmount } = tallyClaimed([true, false, true], 3);
        expect(claimedCount).toBe(2);
        expect(claimedAmount).toBeNull(); // no amounts supplied
    });

    it('sums token amounts for the claimed indices only', () => {
        const { claimedCount, claimedAmount } = tallyClaimed([true, false, true, false], 4, [
            1000n,
            2000n,
            3000n,
            4000n,
        ]);
        expect(claimedCount).toBe(2);
        expect(claimedAmount).toBe(4000n); // 1000 + 3000
    });

    it('ignores padded statuses beyond recipientCount (the contract pads the last window)', () => {
        // 81 recipients, the second chunk returns an 80-wide padded window of all-false
        const statuses = [...Array(81).fill(true), ...Array(79).fill(false)];
        const { claimedCount } = tallyClaimed(statuses, 81);
        expect(claimedCount).toBe(81); // padding past index 80 is not counted
    });

    it('reports zero on an all-unclaimed bitmap', () => {
        expect(tallyClaimed([false, false, false], 3, [1n, 2n, 3n])).toEqual({
            claimedCount: 0,
            claimedAmount: 0n,
        });
    });

    it('treats a short amounts array as zero for missing indices', () => {
        // defensive: amounts shorter than statuses → missing entries contribute 0
        expect(tallyClaimed([true, true], 2, [5n]).claimedAmount).toBe(5n);
    });
});

describe('summarizeAirdropProgress', () => {
    const base = {
        claimedCount: 1,
        recipientCount: 4,
        claimedAmount: 2500n as bigint | null,
        totalAmount: 10_000n,
        contractBalance: 7_500n,
        deadline: 0,
        locked: false,
        source: 'rpc' as const,
    };

    it('computes the claimed fraction', () => {
        expect(summarizeAirdropProgress(base).claimedFraction).toBe(0.25);
    });

    it('fraction is 0 for an empty recipient set (no divide-by-zero)', () => {
        expect(
            summarizeAirdropProgress({ ...base, recipientCount: 0, claimedCount: 0 })
                .claimedFraction,
        ).toBe(0);
    });

    it('fraction is 1.0 when every recipient has claimed', () => {
        expect(summarizeAirdropProgress({ ...base, claimedCount: 4 }).claimedFraction).toBe(1);
    });

    it('is fully funded when balance + claimed covers the total', () => {
        // 7500 + 2500 == 10000 → exactly funded, not under
        expect(summarizeAirdropProgress(base).underFunded).toBe(false);
    });

    it('flags under-funded precisely when balance + claimed falls short', () => {
        // a claimant was paid but the instance holds less than the unclaimed remainder
        expect(summarizeAirdropProgress({ ...base, contractBalance: 7_000n }).underFunded).toBe(
            true,
        );
    });

    it('flags under-funded coarsely (no amounts) only when nothing has been claimed yet', () => {
        // indexer path: claimedAmount unknown, balance short, zero claimed → flag
        expect(
            summarizeAirdropProgress({
                ...base,
                claimedAmount: null,
                claimedCount: 0,
                contractBalance: 9_000n,
                source: 'indexer',
            }).underFunded,
        ).toBe(true);
        // ...but a low balance after a claim is expected, so do NOT false-flag
        expect(
            summarizeAirdropProgress({
                ...base,
                claimedAmount: null,
                claimedCount: 1,
                contractBalance: 9_000n,
                source: 'indexer',
            }).underFunded,
        ).toBe(false);
    });

    it('passes through the on-chain facts and provenance', () => {
        const p = summarizeAirdropProgress({ ...base, source: 'indexer' });
        expect(p.totalAmount).toBe(10_000n);
        expect(p.contractBalance).toBe(7_500n);
        expect(p.source).toBe('indexer');
    });
});

describe('buildWithdrawAirdropArgs', () => {
    it('emits a single Address arg defaulting `to` to the admin', () => {
        const params: WithdrawAirdropParams = { airdrop: AIRDROP, admin: ADMIN };
        const args = buildWithdrawAirdropArgs(params);
        expect(args).toHaveLength(1);
        expect(args[0].switch().name).toBe('scvAddress');
        expect(Address.fromScVal(args[0]).toString()).toBe(ADMIN);
    });

    it('honours an explicit destination', () => {
        const args = buildWithdrawAirdropArgs({ airdrop: AIRDROP, admin: ADMIN, to: OTHER });
        expect(Address.fromScVal(args[0]).toString()).toBe(OTHER);
    });
});
