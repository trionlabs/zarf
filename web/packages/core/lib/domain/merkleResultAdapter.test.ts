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

describe('commitmentToHash', () => {
    it('pads to 32 bytes (64 hex chars), lower-cases, keeps 0x', () => {
        expect(commitmentToHash('0xABC')).toBe(('0x' + 'abc'.padStart(64, '0')) as `0x${string}`);
        expect(commitmentToHash('abc')).toBe(('0x' + 'abc'.padStart(64, '0')) as `0x${string}`);
    });

    it('rejects empty / non-hex / too-long input — closes the 0x000…0 path', () => {
        expect(() => commitmentToHash('')).toThrow(/missing/);
        expect(() => commitmentToHash(undefined)).toThrow(/missing/);
        expect(() => commitmentToHash('0x')).toThrow(/valid hex/);
        expect(() => commitmentToHash('0xZZ')).toThrow(/valid hex/);
        expect(() => commitmentToHash('0x' + 'a'.repeat(65))).toThrow(/> 32 bytes/);
    });
});

describe('rootToHash', () => {
    it('left-pads to 32 bytes', () => {
        expect(rootToHash(0xabcn)).toBe(('0x' + 'abc'.padStart(64, '0')) as `0x${string}`);
    });
});

describe('buildFactoryDeployInputs', () => {
    it('produces parallel arrays + correct total for valid claims', () => {
        const claims = [baseClaim({ amount: 1n }), baseClaim({ amount: 2n }), baseClaim({ amount: 3n })];
        const out = buildFactoryDeployInputs(claims, 0xabcn);
        expect(out.commitments).toHaveLength(3);
        expect(out.amounts).toEqual([1n, 2n, 3n]);
        expect(out.totalAllocation).toBe(6n);
        expect(out.merkleRoot.startsWith('0x')).toBe(true);
        expect(out.merkleRoot).toHaveLength(66);
    });

    it('throws (not silently zero-fills) on a missing identityCommitment', () => {
        const claims = [baseClaim(), baseClaim({ identityCommitment: '' })];
        expect(() => buildFactoryDeployInputs(claims, 0n)).toThrow(/#1/);
    });

    it('rejects non-positive or non-bigint amounts', () => {
        expect(() => buildFactoryDeployInputs([baseClaim({ amount: 0n })], 0n)).toThrow(/positive bigint/);
        expect(() => buildFactoryDeployInputs(
            [baseClaim({ amount: '100' as unknown as bigint })], 0n,
        )).toThrow(/positive bigint/);
    });

    it('rejects empty claims array (cannot deploy with no recipients)', () => {
        expect(() => buildFactoryDeployInputs([], 0n)).toThrow(/empty claims/);
    });
});
