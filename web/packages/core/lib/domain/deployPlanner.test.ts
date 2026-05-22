import { describe, expect, it } from 'vitest';
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
        factoryAddress: 'CFACTORY', tokenAddress: 'CTOKEN', owner: 'GOWNER',
        name: 'X', description: 'Y',
        schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 12, durationUnit: 'months' as const },
        totalAmount: 1000n,
        merkleRoot: '0x' + '01'.repeat(32) as `0x${string}`,
        recipientCount: 1,
        allocationsTotal: 1000n,
        metadataCid: 'bafkreitestcid',
    };

    it('throws on integrity error (allocations sum ≠ totalAmount)', () => {
        expect(() => planDeploy({ ...inputs, allocationsTotal: 999n })).toThrow(/Integrity error/);
    });
});

describe('buildOptimisticContract', () => {
    it('uses TOKEN / 7 when symbol/decimals are unknown; vestingStart from injected clock', () => {
        const out = buildOptimisticContract({
            address: 'CVESTING', name: '', description: '',
            tokenAddress: 'CTOKEN', tokenSymbol: null, tokenDecimals: null,
            owner: 'GOWNER',
            schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 1, durationUnit: 'months' },
            totalAmount: 1234n,
            now: new Date('2025-01-01T00:00:00Z'),
        });
        expect(out.tokenSymbol).toBe('TOKEN');
        expect(out.tokenDecimals).toBe(7);
        expect(out.tokenBalance).toBe(1234n);
        expect(out.vestingStart).toBe(1735689600n);  // 2025-01-01 UTC
    });

    it('uses planned schedule seconds when provided', () => {
        const out = buildOptimisticContract({
            address: 'CVESTING', name: '', description: '',
            tokenAddress: 'CTOKEN',
            owner: 'GOWNER',
            schedule: { cliffEndDate: futureDate, cliffTime: '00:00', distributionDuration: 1, durationUnit: 'months' },
            totalAmount: 1234n,
            plannedSchedule: { cliffSeconds: 0n, vestingSeconds: 1n, periodSeconds: 1n },
        });
        expect(out.cliffDuration).toBe(0n);
        expect(out.vestingDuration).toBe(1n);
        expect(out.vestingPeriod).toBe(1n);
    });
});
