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
    const baseInputs = {
        factoryAddress: '0xfac' as Address,
        tokenAddress: '0xtok' as Address,
        owner: '0xown' as Address,
        name: 'X',
        description: 'Y',
        schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 12, durationUnit: 'months' as const },
        totalAmountWei: 1000n,
        merkleRoot: '0xroot' as Hash,
        commitments: ['0xc1' as Hash, '0xc2' as Hash],
        amounts: [400n, 600n],
        allocationsTotal: 1000n,
    };

    it('returns a fully-populated config when the integrity check passes', () => {
        const cfg = planDeploy(baseInputs, new Date('2025-01-01'));
        expect(cfg.totalAmount).toBe(1000n);
        expect(cfg.commitments).toHaveLength(2);
        expect(cfg.cliffSeconds).toBeGreaterThan(0n);
    });

    it('throws when allocations sum does not match totalAmount', () => {
        expect(() => planDeploy({ ...baseInputs, allocationsTotal: 999n }, new Date('2025-01-01')))
            .toThrow(/Integrity error/);
    });
});

describe('buildOptimisticContract', () => {
    it('packs caller-supplied data into the OnChainVestingContract shape', () => {
        const out = buildOptimisticContract({
            address: '0xnew' as Address,
            name: 'Test',
            description: 'desc',
            tokenAddress: '0xtok' as Address,
            tokenSymbol: 'TKN',
            tokenDecimals: 6,
            owner: '0xown' as Address,
            schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 6, durationUnit: 'months' },
            totalAmountWei: 1234n,
            now: new Date('2025-01-01T00:00:00Z'),
        });
        expect(out.address).toBe('0xnew');
        expect(out.tokenSymbol).toBe('TKN');
        expect(out.tokenDecimals).toBe(6);
        expect(out.tokenBalance).toBe(1234n);
        // 2025-01-01 UTC == 1735689600
        expect(out.vestingStart).toBe(1735689600n);
        expect(out.vestingPeriod).toBeGreaterThan(0n);
    });

    it('falls back to defaults for missing tokenSymbol / tokenDecimals', () => {
        const out = buildOptimisticContract({
            address: '0xa' as Address, name: '', description: '',
            tokenAddress: '0xt' as Address, tokenSymbol: null, tokenDecimals: null,
            owner: '0xo' as Address,
            schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 1, durationUnit: 'months' },
            totalAmountWei: 0n,
        });
        expect(out.tokenSymbol).toBe('TOKEN');
        expect(out.tokenDecimals).toBe(18);
    });
});
