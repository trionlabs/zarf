import { describe, expect, it } from 'vitest';
import type { Address, Hash } from 'viem';
import { planScheduleSeconds, planDeploy, buildOptimisticContract } from './deployPlanner';

const futureDate = '2099-01-01';
const pastDate = '2000-01-01';

describe('planScheduleSeconds', () => {
    it('returns positive cliff/vesting/period for a schedule that ends in the future', () => {
        const out = planScheduleSeconds({
            cliffEndDate: futureDate, cliffTime: '00:00',
            distributionDuration: 12, durationUnit: 'months',
        }, new Date('2025-01-01'));
        expect(out.immediateUnlock).toBe(false);
        expect(out.cliffSeconds).toBeGreaterThan(0n);
        expect(out.vestingSeconds).toBeGreaterThan(0n);
        expect(out.periodSeconds).toBeGreaterThan(0n);
    });

    it('overrides to immediate unlock (0/1/1) when the entire schedule is already in the past', () => {
        const out = planScheduleSeconds({
            cliffEndDate: pastDate, cliffTime: '00:00',
            distributionDuration: 1, durationUnit: 'months',
        }, new Date('2025-01-01'));
        expect(out).toEqual({
            cliffSeconds: 0n, vestingSeconds: 1n, periodSeconds: 1n, immediateUnlock: true,
        });
    });

    it('does NOT override when only the cliff is past but the duration extends into the future', () => {
        const out = planScheduleSeconds({
            cliffEndDate: '2024-01-01', cliffTime: '00:00',
            distributionDuration: 120, durationUnit: 'months', // 10 years
        }, new Date('2025-01-01'));
        expect(out.immediateUnlock).toBe(false);
    });
});

describe('planDeploy', () => {
    const inputs = {
        factoryAddress: '0xfac' as Address, tokenAddress: '0xtok' as Address, owner: '0xown' as Address,
        name: 'X', description: 'Y',
        schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 12, durationUnit: 'months' as const },
        totalAmountWei: 1000n,
        merkleRoot: '0xroot' as Hash, commitments: ['0xc1' as Hash], amounts: [1000n],
        allocationsTotal: 1000n,
    };

    it('throws on integrity error (allocations sum ≠ totalAmount)', () => {
        expect(() => planDeploy({ ...inputs, allocationsTotal: 999n })).toThrow(/Integrity error/);
    });
});

describe('buildOptimisticContract', () => {
    it('falls back to TOKEN / 18 when symbol/decimals are null; vestingStart from injected clock', () => {
        const out = buildOptimisticContract({
            address: '0xa' as Address, name: '', description: '',
            tokenAddress: '0xt' as Address, tokenSymbol: null, tokenDecimals: null,
            owner: '0xo' as Address,
            schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 1, durationUnit: 'months' },
            totalAmountWei: 1234n,
            now: new Date('2025-01-01T00:00:00Z'),
        });
        expect(out.tokenSymbol).toBe('TOKEN');
        expect(out.tokenDecimals).toBe(18);
        expect(out.tokenBalance).toBe(1234n);
        expect(out.vestingStart).toBe(1735689600n);  // 2025-01-01 UTC
    });
});
