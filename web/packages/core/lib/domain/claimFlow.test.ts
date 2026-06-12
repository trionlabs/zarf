import { describe, expect, it } from 'vitest';
import {
    totalAllocation,
    claimedAmount,
    unlockedAmount,
    claimableAmount,
    isCliffPassed,
    cliffEndDate,
    findNextClaimableIdx,
    buildVestingPeriods,
} from './claimFlow';

const e = (amount: bigint, opts: { claimed?: boolean; locked?: boolean } = {}) => ({
    amount,
    unlockTime: 1_800_000_000,
    isClaimed: opts.claimed ?? false,
    isLocked: opts.locked ?? false,
});

describe('amount totals', () => {
    it('total / claimed / unlocked / claimable agree on a representative mix', () => {
        const epochs = [
            e(100n, { claimed: true, locked: false }),
            e(200n, { claimed: false, locked: false }),
            e(400n, { claimed: false, locked: true }),
        ];
        expect(totalAllocation(epochs)).toBe(700n);
        expect(claimedAmount(epochs)).toBe(100n);
        expect(unlockedAmount(epochs)).toBe(300n); // not-locked: 100 + 200
        expect(claimableAmount(epochs)).toBe(200n); // not-locked AND not-claimed
    });
});

describe('cliff math', () => {
    const schedule = {
        vestingStart: 1_700_000_000,
        cliffDuration: 86400,
        vestingDuration: 0,
        vestingPeriod: 0,
    };
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
        expect(
            findNextClaimableIdx([e(1n, { locked: true }), e(1n, { claimed: true })]),
        ).toBeNull();
        expect(
            findNextClaimableIdx([
                e(1n, { claimed: true }),
                e(1n, { locked: true }),
                e(1n), // ← this one
                e(1n),
            ]),
        ).toBe(2);
    });
});

describe('buildVestingPeriods', () => {
    it('uses discovered epochs instead of collapsing to schedule totalPeriods', () => {
        const periods = buildVestingPeriods([
            { ...e(50n), unlockTime: 1_780_876_800 },
            { ...e(70n, { locked: true }), unlockTime: 1_780_880_400 },
        ]);

        expect(periods).toHaveLength(2);
        expect(periods.map((p) => p.amount)).toEqual([50n, 70n]);
        expect(periods.map((p) => p.status)).toEqual(['claimable', 'locked']);
        expect(periods.map((p) => p.cumulativeAmount)).toEqual([50n, 120n]);
    });

    it('keys display index 1-based and derives status per epoch', () => {
        const periods = buildVestingPeriods([
            e(1n, { claimed: true }),
            e(1n),
            e(1n, { claimed: true }),
        ]);
        expect(periods.map((p) => p.index)).toEqual([1, 2, 3]);
        expect(periods.map((p) => p.status)).toEqual(['claimed', 'claimable', 'claimed']);
    });
});
