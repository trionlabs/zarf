import { describe, expect, it } from 'vitest';
import {
    totalAllocation, claimedAmount, unlockedAmount, claimableAmount,
    isCliffPassed, cliffEndDate,
    findNextClaimableIdx, buildClaimedMap,
} from './claimFlow';

const e = (amount: bigint, opts: { claimed?: boolean; locked?: boolean } = {}) => ({
    amount, isClaimed: opts.claimed ?? false, isLocked: opts.locked ?? false,
});

describe('amount totals', () => {
    const epochs = [
        e(100n, { claimed: true,  locked: false }),
        e(200n, { claimed: false, locked: false }),
        e(400n, { claimed: false, locked: true  }),
    ];

    it('total / claimed / unlocked / claimable agree on a representative mix', () => {
        expect(totalAllocation(epochs)).toBe(700n);
        expect(claimedAmount(epochs)).toBe(100n);
        expect(unlockedAmount(epochs)).toBe(300n);   // not-locked: 100 + 200
        expect(claimableAmount(epochs)).toBe(200n);  // not-locked AND not-claimed
    });

    it('all-zero on an empty epoch list', () => {
        expect(totalAllocation([])).toBe(0n);
        expect(claimableAmount([])).toBe(0n);
    });
});

describe('cliff math', () => {
    const schedule = { vestingStart: 1_700_000_000, cliffDuration: 86400, vestingDuration: 0, vestingPeriod: 0 };
    const cliffMs = (1_700_000_000 + 86400) * 1000;

    it('isCliffPassed returns null on missing schedule (NOT true — was a UX bug)', () => {
        expect(isCliffPassed(null)).toBeNull();
        expect(isCliffPassed(undefined)).toBeNull();
    });

    it('isCliffPassed compares against vestingStart + cliffDuration', () => {
        expect(isCliffPassed(schedule, cliffMs - 1)).toBe(false);
        expect(isCliffPassed(schedule, cliffMs)).toBe(true);
        expect(isCliffPassed(schedule, cliffMs + 1)).toBe(true);
    });

    it('cliffEndDate returns the same instant as a Date, or null', () => {
        expect(cliffEndDate(null)).toBeNull();
        expect(cliffEndDate(schedule)?.getTime()).toBe(cliffMs);
    });
});

describe('findNextClaimableIdx', () => {
    it('returns the first index that is unlocked AND unclaimed; null if none', () => {
        expect(findNextClaimableIdx([])).toBeNull();
        expect(findNextClaimableIdx([
            e(1n, { locked: true }),
            e(1n, { claimed: true }),
        ])).toBeNull();
        expect(findNextClaimableIdx([
            e(1n, { claimed: true }),
            e(1n, { locked: true }),
            e(1n),                    // ← this one
            e(1n),
        ])).toBe(2);
    });
});

describe('buildClaimedMap', () => {
    it('keys by array index (NOT leafIndex) — matches calculateVestingPeriods contract', () => {
        const epochs = [e(1n, { claimed: true }), e(1n), e(1n, { claimed: true })];
        expect(buildClaimedMap(epochs)).toEqual({ 0: true, 2: true });
    });
});
