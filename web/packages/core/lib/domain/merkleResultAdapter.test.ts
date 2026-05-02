import { describe, expect, it } from 'vitest';
import type { MerkleClaim } from '../types';
import { commitmentToHash, rootToHash, buildFactoryDeployInputs } from './merkleResultAdapter';

const baseClaim = (overrides: Partial<MerkleClaim> = {}): MerkleClaim => ({
    email: 'a@b.co',
    amount: 1000n,
    salt: '0x1',
    identityCommitment: '0x' + 'ab'.repeat(32),
    leaf: 0n,
    leafIndex: 0,
    unlockTime: 0,
    ...overrides,
});

describe('commitmentToHash / rootToHash', () => {
    it('left-pads to 32 bytes (64 hex chars), lowercases, keeps 0x', () => {
        const expected = ('0x' + 'abc'.padStart(64, '0')) as `0x${string}`;
        expect(commitmentToHash('0xABC')).toBe(expected);
        expect(commitmentToHash('abc')).toBe(expected);
        expect(rootToHash(0xabcn)).toBe(expected);
    });

    it('rejects empty / non-hex / too-long — closes the 0x000…0 silent-fill path', () => {
        expect(() => commitmentToHash('')).toThrow(/missing/);
        expect(() => commitmentToHash(undefined)).toThrow(/missing/);
        expect(() => commitmentToHash('0xZZ')).toThrow(/valid hex/);
        expect(() => commitmentToHash('0x' + 'a'.repeat(65))).toThrow(/> 32 bytes/);
        expect(() => rootToHash(-1n)).toThrow(/non-negative/);
        expect(() => rootToHash(1n << 256n)).toThrow(/32 bytes/);
    });
});

describe('buildFactoryDeployInputs', () => {
    it('produces parallel arrays and correct total for valid claims', () => {
        const out = buildFactoryDeployInputs(
            [baseClaim({ amount: 1n }), baseClaim({ amount: 2n }), baseClaim({ amount: 3n })],
            0xabcn,
        );
        expect(out.amounts).toEqual([1n, 2n, 3n]);
        expect(out.totalAllocation).toBe(6n);
        expect(out.merkleRoot).toHaveLength(66);
    });

    it('rejects malformed input (empty list, missing commitment, non-positive amount)', () => {
        expect(() => buildFactoryDeployInputs([], 0n)).toThrow(/empty claims/);
        expect(() => buildFactoryDeployInputs(
            [baseClaim(), baseClaim({ identityCommitment: '' })], 0n,
        )).toThrow(/#1/);
        expect(() => buildFactoryDeployInputs([baseClaim({ amount: 0n })], 0n)).toThrow(/positive bigint/);
    });
});
