import { describe, expect, it } from 'vitest';
import {
    validateDistributionData,
    type DistributionData,
} from './distribution';

const validSchedule = {
    vestingStart: 1700000000,
    cliffDuration: 86400 * 30,
    vestingDuration: 86400 * 365,
    vestingPeriod: 86400,
};

const validCommitment = {
    amount: '1000000000000000000',
    unlockTime: 1700000000 + 86400 * 30,
    index: 0,
};

const validData: DistributionData = {
    merkleRoot: '0xabc123',
    schedule: validSchedule,
    commitments: { '0xdeadbeef': validCommitment },
};

describe('validateDistributionData — accepts valid input', () => {
    it('returns the same object for a minimal valid distribution', () => {
        const result = validateDistributionData({ ...validData });
        expect(result.merkleRoot).toBe('0xabc123');
        expect(result.commitments['0xdeadbeef']).toEqual(validCommitment);
    });

    it('accepts an empty commitments map (no entries to spot-check)', () => {
        expect(() => validateDistributionData({
            ...validData,
            commitments: {},
        })).not.toThrow();
    });

    it('accepts optional leaves array', () => {
        const result = validateDistributionData({
            ...validData,
            leaves: ['0x1', '0x2'],
        });
        expect(result.leaves).toEqual(['0x1', '0x2']);
    });

    it('accepts optional emailHashes array (newer schema)', () => {
        const result = validateDistributionData({
            ...validData,
            emailHashes: ['0xaa', '0xbb'],
        });
        expect(result.emailHashes).toEqual(['0xaa', '0xbb']);
    });

    it('accepts data without optional leaves/emailHashes', () => {
        const result = validateDistributionData(validData);
        expect(result.leaves).toBeUndefined();
        expect(result.emailHashes).toBeUndefined();
    });
});

describe('validateDistributionData — rejects invalid input', () => {
    it('throws on non-object input', () => {
        expect(() => validateDistributionData(null)).toThrow(/expected object/);
        expect(() => validateDistributionData('string')).toThrow(/expected object/);
        expect(() => validateDistributionData(42)).toThrow(/expected object/);
        expect(() => validateDistributionData(undefined)).toThrow(/expected object/);
    });

    it('throws on missing merkleRoot', () => {
        const { merkleRoot, ...rest } = validData;
        expect(() => validateDistributionData(rest)).toThrow(/merkleRoot/);
    });

    it('throws on non-string merkleRoot', () => {
        expect(() => validateDistributionData({ ...validData, merkleRoot: 42 }))
            .toThrow(/merkleRoot/);
        expect(() => validateDistributionData({ ...validData, merkleRoot: null }))
            .toThrow(/merkleRoot/);
    });

    it('throws on merkleRoot without 0x prefix', () => {
        expect(() => validateDistributionData({ ...validData, merkleRoot: 'abc123' }))
            .toThrow(/0x-prefixed/);
    });

    it('throws on missing schedule', () => {
        const { schedule, ...rest } = validData;
        expect(() => validateDistributionData(rest)).toThrow(/schedule/);
    });

    it('throws on null schedule', () => {
        expect(() => validateDistributionData({ ...validData, schedule: null }))
            .toThrow(/schedule/);
    });

    it('throws on missing schedule fields', () => {
        for (const field of ['vestingStart', 'cliffDuration', 'vestingDuration', 'vestingPeriod'] as const) {
            const { [field]: _, ...partialSchedule } = validSchedule;
            expect(() => validateDistributionData({
                ...validData,
                schedule: partialSchedule,
            })).toThrow(new RegExp(`schedule\\.${field}`));
        }
    });

    it('throws on non-finite schedule numbers', () => {
        expect(() => validateDistributionData({
            ...validData,
            schedule: { ...validSchedule, vestingStart: NaN },
        })).toThrow(/vestingStart/);

        expect(() => validateDistributionData({
            ...validData,
            schedule: { ...validSchedule, cliffDuration: Infinity },
        })).toThrow(/cliffDuration/);
    });

    it('throws on string schedule values', () => {
        expect(() => validateDistributionData({
            ...validData,
            schedule: { ...validSchedule, vestingDuration: '365' },
        })).toThrow(/vestingDuration/);
    });

    it('throws on missing commitments', () => {
        const { commitments, ...rest } = validData;
        expect(() => validateDistributionData(rest)).toThrow(/commitments/);
    });

    it('throws on null commitments', () => {
        expect(() => validateDistributionData({ ...validData, commitments: null }))
            .toThrow(/commitments/);
    });

    it('throws when a commitment entry has wrong shape', () => {
        expect(() => validateDistributionData({
            ...validData,
            commitments: { '0xkey': 'not-an-object' },
        })).toThrow(/0xkey/);

        expect(() => validateDistributionData({
            ...validData,
            commitments: { '0xkey': { ...validCommitment, amount: 1000 } },
        })).toThrow(/amount/);

        expect(() => validateDistributionData({
            ...validData,
            commitments: { '0xkey': { ...validCommitment, unlockTime: 'soon' } },
        })).toThrow(/unlockTime/);

        expect(() => validateDistributionData({
            ...validData,
            commitments: { '0xkey': { ...validCommitment, index: 1.5 } },
        })).toThrow(/index/);
    });

    it('throws on non-array leaves', () => {
        expect(() => validateDistributionData({ ...validData, leaves: 'not-array' }))
            .toThrow(/leaves/);
    });

    it('throws on non-array emailHashes', () => {
        expect(() => validateDistributionData({ ...validData, emailHashes: {} }))
            .toThrow(/emailHashes/);
    });
});

describe('validateDistributionData — golden fixture from real distribution shape', () => {
    it('accepts a realistic full distribution', () => {
        const real = {
            merkleRoot: '0x4f8e2a1b3c9d7e6f5a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f',
            schedule: {
                vestingStart: 1714176000,
                cliffDuration: 7776000,    // 90 days
                vestingDuration: 31536000, // 1 year
                vestingPeriod: 2592000,    // 30 days
            },
            commitments: {
                '0x1111111111111111111111111111111111111111111111111111111111111111': {
                    amount: '500000000000000000000',
                    unlockTime: 1721952000,
                    index: 0,
                },
                '0x2222222222222222222222222222222222222222222222222222222222222222': {
                    amount: '750000000000000000000',
                    unlockTime: 1724544000,
                    index: 1,
                },
            },
            leaves: [
                '0xaaaa', '0xbbbb',
            ],
            emailHashes: [
                '0xcccc', '0xdddd',
            ],
        };
        expect(() => validateDistributionData(real)).not.toThrow();
        const result = validateDistributionData(real);
        expect(result.commitments['0x1111111111111111111111111111111111111111111111111111111111111111'].amount)
            .toBe('500000000000000000000');
    });
});
