import { describe, expect, it } from 'vitest';
import { validateDistributionData, type DistributionData } from './distribution';

const validData: DistributionData = {
    merkleRoot: '0xabc123',
    schedule: {
        vestingStart: 1700000000,
        cliffDuration: 86400,
        vestingDuration: 31536000,
        vestingPeriod: 86400,
    },
    commitments: {
        '0xdeadbeef': { amount: '1000000000000000000', unlockTime: 1700086400, index: 0 },
    },
};

describe('validateDistributionData — accepts', () => {
    it('a minimal valid object, with optional leaves and emailHashes', () => {
        const full = { ...validData, leaves: ['0x1'], emailHashes: ['0xaa'] };
        expect(() => validateDistributionData(full)).not.toThrow();
        expect(validateDistributionData(full).emailHashes).toEqual(['0xaa']);
    });

    it('an empty commitments map (no entries → no spot-check)', () => {
        expect(() => validateDistributionData({ ...validData, commitments: {} })).not.toThrow();
    });

    it('commitment entries can be arrays for duplicate commitment metadata', () => {
        expect(() =>
            validateDistributionData({
                ...validData,
                commitments: {
                    '0xdeadbeef': [
                        { amount: '1', unlockTime: 1, index: 0 },
                        { amount: '2', unlockTime: 2, index: 1 },
                    ],
                },
            }),
        ).not.toThrow();
    });
});

describe('validateDistributionData — rejects (each path must throw a descriptive error)', () => {
    it('non-objects (null, primitives)', () => {
        expect(() => validateDistributionData(null)).toThrow(/expected object/);
        expect(() => validateDistributionData('x')).toThrow(/expected object/);
    });

    it('missing or non-hex merkleRoot', () => {
        const { merkleRoot: _merkleRoot, ...noRoot } = validData;
        expect(() => validateDistributionData(noRoot)).toThrow(/merkleRoot/);
        expect(() => validateDistributionData({ ...validData, merkleRoot: 'abc' })).toThrow(
            /0x-prefixed/,
        );
    });

    it('missing schedule or any non-finite schedule field', () => {
        expect(() => validateDistributionData({ ...validData, schedule: null })).toThrow(
            /schedule/,
        );
        expect(() =>
            validateDistributionData({
                ...validData,
                schedule: { ...validData.schedule, vestingStart: NaN },
            }),
        ).toThrow(/vestingStart/);
        const { vestingDuration: _vestingDuration, ...partial } = validData.schedule;
        expect(() => validateDistributionData({ ...validData, schedule: partial })).toThrow(
            /vestingDuration/,
        );
    });

    it('missing commitments or a malformed commitment entry', () => {
        const { commitments: _commitments, ...noCommits } = validData;
        expect(() => validateDistributionData(noCommits)).toThrow(/commitments/);
        expect(() =>
            validateDistributionData({
                ...validData,
                commitments: { '0xkey': { amount: 1000, unlockTime: 1, index: 0 } },
            }),
        ).toThrow(/amount/);
        expect(() =>
            validateDistributionData({
                ...validData,
                commitments: { '0xkey': { amount: '1', unlockTime: 1, index: 1.5 } },
            }),
        ).toThrow(/index/);
    });

    it('non-array leaves or emailHashes when present', () => {
        expect(() => validateDistributionData({ ...validData, leaves: 'x' })).toThrow(/leaves/);
        expect(() => validateDistributionData({ ...validData, emailHashes: {} })).toThrow(
            /emailHashes/,
        );
    });

    it('a commitment index at or above the TREE_DEPTH ceiling (CRIT-8 DoS bound)', () => {
        // TREE_DEPTH = 20 → max index is 2**20 - 1 = 1_048_575
        expect(() =>
            validateDistributionData({
                ...validData,
                commitments: {
                    '0xkey': { amount: '1', unlockTime: 1, index: 2 ** 20 },
                },
            }),
        ).toThrow(/exceeds maximum/);
        expect(() =>
            validateDistributionData({
                ...validData,
                commitments: {
                    '0xkey': { amount: '1', unlockTime: 1, index: 2_000_000_000 },
                },
            }),
        ).toThrow(/exceeds maximum/);
    });
});

describe('validateDistributionData — index boundary (CRIT-8)', () => {
    it('accepts index === 2**TREE_DEPTH - 1 (boundary)', () => {
        expect(() =>
            validateDistributionData({
                ...validData,
                commitments: {
                    '0xkey': { amount: '1', unlockTime: 1, index: 2 ** 20 - 1 },
                },
            }),
        ).not.toThrow();
    });
});
