import { describe, expect, it } from 'vitest';
import {
    BASE_RESERVE_STROOPS,
    computeReserveStroops,
    formatXlmAmount,
    xlmToStroops,
} from './balance';

describe('xlmToStroops', () => {
    it('converts a whole-and-fraction string exactly', () => {
        expect(xlmToStroops('10000.0000000')).toBe(100_000_000_000n);
        expect(xlmToStroops('1.5')).toBe(15_000_000n);
        expect(xlmToStroops('0.0000001')).toBe(1n); // one stroop
    });

    it('stays exact far beyond Number.MAX_SAFE_INTEGER (no float)', () => {
        // 1,000,000,000 XLM = 1e16 stroops, well past 2^53.
        expect(xlmToStroops('1000000000.0000001')).toBe(10_000_000_000_000_001n);
    });

    it('truncates fractions beyond 7 digits rather than rounding', () => {
        expect(xlmToStroops('1.99999999')).toBe(19_999_999n);
    });

    it('handles missing integer/fraction and empty input', () => {
        expect(xlmToStroops('.5')).toBe(5_000_000n);
        expect(xlmToStroops('42')).toBe(420_000_000n);
        expect(xlmToStroops('')).toBe(0n);
        expect(xlmToStroops('   ')).toBe(0n);
    });
});

describe('formatXlmAmount', () => {
    it('truncates (never rounds up) to 4 decimals', () => {
        expect(formatXlmAmount(19_999_900n)).toBe('1.9999'); // 1.99999 → not "2.0000"
        expect(formatXlmAmount(100_000_000_000n)).toBe('10000.0000');
    });

    it('renders exact zero as 0.0000', () => {
        expect(formatXlmAmount(0n)).toBe('0.0000');
    });

    it('shows dust below display precision as "< 0.0001"', () => {
        expect(formatXlmAmount(500n)).toBe('< 0.0001'); // 0.00005 XLM
        expect(formatXlmAmount(1n)).toBe('< 0.0001');
    });

    it('respects a custom decimal count', () => {
        expect(formatXlmAmount(19_999_999n, 7)).toBe('1.9999999');
        expect(formatXlmAmount(420_000_000n, 0)).toBe('42');
    });
});

describe('computeReserveStroops', () => {
    it('reserves 2 base reserves (1 XLM) for an account with no subentries', () => {
        expect(computeReserveStroops(0)).toBe(2n * BASE_RESERVE_STROOPS); // 1 XLM
    });

    it('adds one base reserve per subentry', () => {
        expect(computeReserveStroops(3)).toBe(5n * BASE_RESERVE_STROOPS); // 2.5 XLM
    });

    it('accounts for sponsoring and sponsored entries', () => {
        expect(computeReserveStroops(0, 2, 1)).toBe(3n * BASE_RESERVE_STROOPS);
    });

    it('never goes negative when heavily sponsored', () => {
        expect(computeReserveStroops(0, 0, 10)).toBe(0n);
    });
});
