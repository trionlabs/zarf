import { describe, expect, it } from 'vitest';
import { formatTokenAmount, parseTokenAmount } from './amount';

describe('parseTokenAmount — decimals chokepoint guard (B7)', () => {
    it('accepts valid decimals at boundaries', () => {
        expect(parseTokenAmount('1', 0)).toBe(1n);
        expect(parseTokenAmount('1.0000001', 7)).toBe(10000001n);
        expect(parseTokenAmount('1', 18)).toBe(10n ** 18n);
    });

    it('rejects negative decimals before the math runs', () => {
        expect(() => parseTokenAmount('1', -1)).toThrow(/outside the supported range/);
    });

    it('rejects decimals above the 18 cap before the math runs', () => {
        expect(() => parseTokenAmount('1', 19)).toThrow(/outside the supported range/);
        expect(() => parseTokenAmount('1', 38)).toThrow(/outside the supported range/);
    });

    it('rejects non-integer decimals', () => {
        expect(() => parseTokenAmount('1', 7.5)).toThrow(/must be an integer/);
        expect(() => parseTokenAmount('1', NaN)).toThrow(/must be an integer/);
        expect(() => parseTokenAmount('1', Infinity)).toThrow(/must be an integer/);
    });
});

describe('formatTokenAmount — decimals chokepoint guard (B7)', () => {
    it('accepts valid decimals at boundaries', () => {
        expect(formatTokenAmount(10000001n, 7, 7)).toBe('1.0000001');
        expect(formatTokenAmount(10n ** 18n, 18)).toBe('1');
    });

    it('rejects negative decimals before the divisor math runs', () => {
        expect(() => formatTokenAmount(1n, -1)).toThrow(/outside the supported range/);
    });

    it('rejects decimals above the 18 cap before the divisor math runs', () => {
        expect(() => formatTokenAmount(1n, 19)).toThrow(/outside the supported range/);
    });

    it('rejects non-integer decimals', () => {
        expect(() => formatTokenAmount(1n, 7.5)).toThrow(/must be an integer/);
    });
});
