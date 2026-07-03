import { describe, expect, it } from 'vitest';
import {
    formatTokenAmount,
    parseTokenAmount,
    isPositiveAmountString,
    isValidTokenAmount,
} from './amount';

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

describe('isPositiveAmountString — string-amount grammar (no float rounding)', () => {
    it('accepts positive decimal strings', () => {
        expect(isPositiveAmountString('1')).toBe(true);
        expect(isPositiveAmountString('0.5')).toBe(true);
        expect(isPositiveAmountString('  100  ')).toBe(true);
        expect(isPositiveAmountString('123456789012345678')).toBe(true); // > 2^53
    });

    it('rejects zero, negatives, exponents, and junk', () => {
        expect(isPositiveAmountString('0')).toBe(false);
        expect(isPositiveAmountString('0.0')).toBe(false);
        expect(isPositiveAmountString('-1')).toBe(false);
        expect(isPositiveAmountString('1e21')).toBe(false);
        expect(isPositiveAmountString('1.2.3')).toBe(false);
        expect(isPositiveAmountString('')).toBe(false);
        expect(isPositiveAmountString('abc')).toBe(false);
    });
});

describe('isValidTokenAmount — decimals + i128 range (non-throwing)', () => {
    it('accepts in-range amounts within the token decimals', () => {
        expect(isValidTokenAmount('1.5', 7)).toBe(true);
        expect(isValidTokenAmount('123456789012345678', 0)).toBe(true); // exact, fits i128
    });

    it('rejects over-precision, zero, exponent, and i128 overflow', () => {
        expect(isValidTokenAmount('0.12345678', 7)).toBe(false); // 8 dp > 7
        expect(isValidTokenAmount('0', 7)).toBe(false);
        expect(isValidTokenAmount('1e21', 7)).toBe(false);
        // 2^127 base units overflows i128 (max 2^127 - 1).
        expect(isValidTokenAmount('170141183460469231731687303715884105728', 0)).toBe(false);
    });
});
