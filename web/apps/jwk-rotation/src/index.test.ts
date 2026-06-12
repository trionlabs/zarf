import { describe, expect, it } from 'vitest';
import {
    jwkModulusToLimbs,
    hashLimbs,
    parseBoolean,
    parsePositiveInt,
    bigIntToFieldHex,
    hexToBytes,
    bytesToHex,
} from './index';

describe('jwkModulusToLimbs', () => {
    it('splits a modulus into 18 little-endian 120-bit limbs', () => {
        // n = 1 (base64url "AQ") -> limb 0 = 1, rest zero.
        const limbs = jwkModulusToLimbs('AQ');
        expect(limbs).toHaveLength(18);
        expect(BigInt(limbs[0])).toBe(1n);
        for (let i = 1; i < 18; i++) expect(BigInt(limbs[i])).toBe(0n);
    });

    it('places bits above 120 into the next limb', () => {
        // n = 2^120 -> limb0 = 0, limb1 = 1. Build the base64url for it.
        const value = 1n << 120n;
        const bytes: number[] = [];
        let v = value;
        while (v > 0n) {
            bytes.unshift(Number(v & 0xffn));
            v >>= 8n;
        }
        const b64 = Buffer.from(bytes)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const limbs = jwkModulusToLimbs(b64);
        expect(BigInt(limbs[0])).toBe(0n);
        expect(BigInt(limbs[1])).toBe(1n);
    });

    it('round-trips: recombining the limbs reproduces the modulus', () => {
        // A small but multi-limb value.
        const value = (1n << 130n) + (1n << 5n) + 7n;
        const bytes: number[] = [];
        let v = value;
        while (v > 0n) {
            bytes.unshift(Number(v & 0xffn));
            v >>= 8n;
        }
        const b64 = Buffer.from(bytes)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const limbs = jwkModulusToLimbs(b64);
        let recombined = 0n;
        for (let i = 17; i >= 0; i--) {
            recombined = (recombined << 120n) + BigInt(limbs[i]);
        }
        expect(recombined).toBe(value);
    });
});

describe('hashLimbs', () => {
    it('is deterministic and 32 bytes', () => {
        const limbs = jwkModulusToLimbs('AQAB');
        const a = hashLimbs(limbs);
        const b = hashLimbs(limbs);
        expect(a).toBe(b);
        expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('differs for different moduli', () => {
        expect(hashLimbs(jwkModulusToLimbs('AQ'))).not.toBe(hashLimbs(jwkModulusToLimbs('Aw')));
    });
});

describe('parseBoolean', () => {
    it('treats common truthy strings as true', () => {
        for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
            expect(parseBoolean(v, false)).toBe(true);
        }
    });

    it('falls back for empty/undefined', () => {
        expect(parseBoolean(undefined, true)).toBe(true);
        expect(parseBoolean('', true)).toBe(true);
        expect(parseBoolean(null, false)).toBe(false);
    });

    it('treats anything else as false', () => {
        expect(parseBoolean('nope', true)).toBe(false);
    });
});

describe('parsePositiveInt (revocation-rail bounds)', () => {
    it('parses non-negative integers', () => {
        expect(parsePositiveInt('0', 5)).toBe(0);
        expect(parsePositiveInt('3', 5)).toBe(3);
    });

    it('falls back on garbage, negatives, and floats', () => {
        expect(parsePositiveInt('-1', 5)).toBe(5);
        expect(parsePositiveInt('1.5', 5)).toBe(5);
        expect(parsePositiveInt('abc', 5)).toBe(5);
        expect(parsePositiveInt(undefined, 5)).toBe(5);
    });
});

describe('hex helpers', () => {
    it('round-trips bytes <-> hex', () => {
        const hex = bigIntToFieldHex(255n);
        expect(hex).toBe('0x' + '0'.repeat(62) + 'ff');
        expect(bytesToHex(hexToBytes(hex, 32))).toBe(hex);
    });

    it('rejects malformed hex', () => {
        expect(() => hexToBytes('0xzz' as `0x${string}`)).toThrow();
    });
});
