import { describe, expect, it } from 'vitest';
import { durationToSeconds, unitToPeriodSeconds, calculateEndDate } from './vesting';
import { DURATION_UNITS, getSelectableDurationUnits } from '../constants/time';
import type { DurationUnit } from '../types';

const DAY = 86_400n;

describe('unitToPeriodSeconds', () => {
    it('returns one day for the days unit', () => {
        expect(unitToPeriodSeconds('days')).toBe(DAY);
    });

    it('is defined and positive for every selectable unit (exhaustive)', () => {
        for (const { value } of DURATION_UNITS) {
            expect(unitToPeriodSeconds(value)).toBeGreaterThan(0n);
        }
    });

    it('throws on an unknown unit', () => {
        expect(() => unitToPeriodSeconds('fortnight' as DurationUnit)).toThrow();
    });
});

describe('durationToSeconds', () => {
    it('scales the days unit by 86400', () => {
        expect(durationToSeconds(1, 'days')).toBe(DAY);
        expect(durationToSeconds(30, 'days')).toBe(30n * DAY);
    });

    it('keeps the ladder ordered: minute < hour < day < week', () => {
        expect(durationToSeconds(1, 'minutes')).toBeLessThan(durationToSeconds(1, 'hours'));
        expect(durationToSeconds(1, 'hours')).toBeLessThan(durationToSeconds(1, 'days'));
        expect(durationToSeconds(1, 'days')).toBeLessThan(durationToSeconds(1, 'weeks'));
    });
});

describe('calculateEndDate', () => {
    it('advances by whole days for the days unit', () => {
        const start = new Date('2025-06-10T12:00:00Z');
        const end = calculateEndDate(start, 5, 'days')!;
        const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
        expect(diffDays).toBe(5);
    });

    it('throws on an unknown unit (exhaustive switch hardening)', () => {
        expect(() => calculateEndDate(new Date(), 1, 'fortnight' as DurationUnit)).toThrow();
    });
});

describe('getSelectableDurationUnits', () => {
    it('always offers days (production and test)', () => {
        expect(getSelectableDurationUnits(true).some((u) => u.value === 'days')).toBe(true);
        expect(getSelectableDurationUnits(false).some((u) => u.value === 'days')).toBe(true);
    });

    it('hides sub-day units in production (mainnet)', () => {
        const prod = getSelectableDurationUnits(false).map((u) => u.value);
        expect(prod).toEqual(['days', 'weeks', 'months', 'quarters', 'years']);
    });

    it('exposes sub-day units in dev/testnet', () => {
        const test = getSelectableDurationUnits(true).map((u) => u.value);
        expect(test).toContain('minutes');
        expect(test).toContain('hours');
    });
});
