// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildClaimList, serializeClaimList } from './claimListBuilder';
import type { MerkleClaim } from '../types';

function claim(overrides: Partial<MerkleClaim>): MerkleClaim {
    return {
        email: 'a@b.com',
        amount: 100n,
        salt: '0x01',
        identityCommitment: '0xabc',
        leaf: 0x1n,
        leafIndex: 0,
        unlockTime: 1_700_000_000,
        ...overrides,
    };
}

describe('buildClaimList', () => {
    const inputs = {
        root: 0xdeadn,
        cliffSeconds: 86400n,
        vestingSeconds: 31536000n,
        periodSeconds: 2592000n,
    };

    it('throws on empty claims', async () => {
        await expect(
            buildClaimList({ ...inputs, claims: [] }),
        ).rejects.toThrow(/no claims/);
    });

    it('produces byte-identical output for the same logical input (CID stability)', async () => {
        const a = await buildClaimList({
            ...inputs,
            claims: [
                claim({ email: 'a@b.com', leafIndex: 0, leaf: 1n, identityCommitment: '0xa', unlockTime: 100 }),
                claim({ email: 'c@d.com', leafIndex: 1, leaf: 2n, identityCommitment: '0xb', unlockTime: 200 }),
            ],
        });
        // Different insertion order, same logical content
        const b = await buildClaimList({
            ...inputs,
            claims: [
                claim({ email: 'c@d.com', leafIndex: 1, leaf: 2n, identityCommitment: '0xb', unlockTime: 200 }),
                claim({ email: 'a@b.com', leafIndex: 0, leaf: 1n, identityCommitment: '0xa', unlockTime: 100 }),
            ],
        });
        expect(serializeClaimList(a)).toEqual(serializeClaimList(b));
    });

    it('orders leaves by leafIndex regardless of input order', async () => {
        const out = await buildClaimList({
            ...inputs,
            claims: [
                claim({ leafIndex: 2, leaf: 0x30n, identityCommitment: '0xc' }),
                claim({ leafIndex: 0, leaf: 0x10n, identityCommitment: '0xa' }),
                claim({ leafIndex: 1, leaf: 0x20n, identityCommitment: '0xb' }),
            ],
        });
        expect(out.leaves[0].endsWith('10')).toBe(true);
        expect(out.leaves[1].endsWith('20')).toBe(true);
        expect(out.leaves[2].endsWith('30')).toBe(true);
    });

    it('deduplicates emails before hashing and sorts emailHashes', async () => {
        const out = await buildClaimList({
            ...inputs,
            claims: [
                claim({ email: 'a@b.com', leafIndex: 0, identityCommitment: '0xa' }),
                claim({ email: 'a@b.com', leafIndex: 1, identityCommitment: '0xb' }), // same email, different epoch
                claim({ email: 'c@d.com', leafIndex: 2, identityCommitment: '0xc' }),
            ],
        });
        expect(out.emailHashes.length).toBe(2);
        const sorted = [...out.emailHashes].sort();
        expect(out.emailHashes).toEqual(sorted);
    });

    it('serializes amount as string (not BigInt) and pads commitment keys to 32 bytes', async () => {
        const out = await buildClaimList({
            ...inputs,
            claims: [claim({ amount: 12345n, identityCommitment: '0xdead' })],
        });
        const key = Object.keys(out.commitments)[0];
        expect(key).toMatch(/^0x[0-9a-f]{64}$/);
        const entry = out.commitments[key];
        expect(Array.isArray(entry)).toBe(false);
        if (!Array.isArray(entry)) {
            expect(entry.amount).toBe('12345');
        }
    });

    it('preserves duplicate commitment metadata as an array', async () => {
        const out = await buildClaimList({
            ...inputs,
            claims: [
                claim({ leafIndex: 0, amount: 100n, identityCommitment: '0xabc' }),
                claim({ leafIndex: 1, amount: 200n, identityCommitment: '0xabc' }),
            ],
        });
        const key = Object.keys(out.commitments)[0];
        expect(out.commitments[key]).toEqual([
            { amount: '100', unlockTime: 1_700_000_000, index: 0 },
            { amount: '200', unlockTime: 1_700_000_000, index: 1 },
        ]);
    });

    it('schedule.totalPeriods = vestingSeconds / periodSeconds', async () => {
        const out = await buildClaimList({
            ...inputs,
            claims: [claim({})],
            vestingSeconds: 100n,
            periodSeconds: 10n,
        });
        expect(out.schedule.totalPeriods).toBe(10);
    });

    it('schedule.vestingStart = min unlockTime across claims', async () => {
        const out = await buildClaimList({
            ...inputs,
            claims: [
                claim({ leafIndex: 0, unlockTime: 500, identityCommitment: '0xa' }),
                claim({ leafIndex: 1, unlockTime: 100, identityCommitment: '0xb' }),
                claim({ leafIndex: 2, unlockTime: 300, identityCommitment: '0xc' }),
            ],
        });
        expect(out.schedule.vestingStart).toBe(100);
    });
});
