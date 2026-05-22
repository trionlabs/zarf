import { describe, expect, it } from 'vitest';
import { validateTokenDecimals } from './tokenDecimals';

describe('validateTokenDecimals — accepts', () => {
    it('0 (whole-number tokens)', () => {
        expect(() => validateTokenDecimals(0)).not.toThrow();
    });

    it('7 (Stellar classic asset convention)', () => {
        expect(() => validateTokenDecimals(7)).not.toThrow();
    });

    it('18 (Soroban reference + EVM ERC-20 convention, boundary)', () => {
        expect(() => validateTokenDecimals(18)).not.toThrow();
    });
});

describe('validateTokenDecimals — rejects', () => {
    it('19 (just over the supported range)', () => {
        expect(() => validateTokenDecimals(19)).toThrow(/outside the supported range/);
    });

    it('negative values (would crash parseTokenAmount on BigInt(negative) exponent)', () => {
        expect(() => validateTokenDecimals(-1)).toThrow(/outside the supported range/);
    });

    it('non-integer values', () => {
        expect(() => validateTokenDecimals(7.5)).toThrow(/integer/);
    });

    it('Infinity', () => {
        expect(() => validateTokenDecimals(Infinity)).toThrow(/integer/);
    });

    it('NaN', () => {
        expect(() => validateTokenDecimals(NaN)).toThrow(/integer/);
    });

    it('non-number coerced types', () => {
        expect(() => validateTokenDecimals('7' as unknown as number)).toThrow(/integer/);
        expect(() => validateTokenDecimals(null as unknown as number)).toThrow(/integer/);
    });
});
