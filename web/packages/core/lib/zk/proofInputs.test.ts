import { describe, expect, it } from 'vitest';
import {
    toHex,
    padMerkleProof,
    padEmail,
    buildCircuitInputs,
    TREE_DEPTH,
    type ClaimData,
    type NoirJwtResult,
} from './proofInputs';

describe('toHex', () => {
    it('passes 0x-prefixed strings through; coerces decimal strings, numbers, bigints via BigInt', () => {
        expect(toHex('0x1234')).toBe('0x1234');
        expect(toHex('255')).toBe('0xff');
        expect(toHex(255)).toBe('0xff');
        expect(toHex(2n ** 64n)).toBe('0x10000000000000000');
    });
});

describe('padMerkleProof', () => {
    it('pads to TREE_DEPTH with 0x0; preserves originals; normalizes via toHex', () => {
        const { siblings, indices } = padMerkleProof(['0xaa', '255'], ['0', '1']);
        expect(siblings).toHaveLength(TREE_DEPTH);
        expect(indices).toHaveLength(TREE_DEPTH);
        expect(siblings.slice(0, 2)).toEqual(['0xaa', '0xff']); // decimal-string normalized
        expect(indices.slice(0, 2)).toEqual(['0x0', '0x1']);
        expect(siblings.slice(2).every((s) => s === '0x0')).toBe(true);
    });

    it('does not mutate input arrays', () => {
        const inSibs = ['0xaa'];
        padMerkleProof(inSibs, ['0x0']);
        expect(inSibs).toEqual(['0xaa']);
    });

    it('rejects mismatched or over-depth proofs', () => {
        expect(() => padMerkleProof(['0xaa'], [])).toThrow(/length mismatch/);
        expect(() =>
            padMerkleProof(Array(TREE_DEPTH + 1).fill('0x0'), Array(TREE_DEPTH + 1).fill('0x0')),
        ).toThrow(/exceeds depth/);
    });
});

describe('padEmail', () => {
    it('uses UTF-8 byte length for len', () => {
        // 'é' = 1 char, 2 UTF-8 bytes.
        const { storage, len } = padEmail('é', 8);
        expect(storage).toEqual([0xc3, 0xa9, 0, 0, 0, 0, 0, 0]);
        expect(len).toBe(2);
    });

    it('rejects emails that exceed the circuit byte slot', () => {
        expect(() => padEmail('ééééé', 8)).toThrow(/MAX_EMAIL_LENGTH/);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// buildCircuitInputs — the load-bearing contract test for the worker
// ──────────────────────────────────────────────────────────────────────────

const fixtureClaim: ClaimData = {
    email: 'alice@example.com',
    salt: '0x123456789abcdef',
    amount: '0xde0b6b3a7640000',
    merkleProof: { siblings: ['0xaa', '0xbb', '0xcc'], indices: ['0x0', '0x1', '0x0'] },
    merkleRoot: '0xabc',
    recipient: '0x742d35cc6634c0532925a3b844bc9e7595f0bcb1',
    unlockTime: '0x65f1d3a0',
    audience: 'test-client-id.apps.googleusercontent.com',
};

const fixtureJwt: NoirJwtResult = {
    base64_decode_offset: 7,
    redc_params_limbs: ['0x1', '0x2'],
    signature_limbs: ['0xa'],
    pubkey_modulus_limbs: ['0xff'],
    data: { storage: [1, 2, 3], len: 3 },
};

describe('buildCircuitInputs', () => {
    it('produces the exact circuit input shape (golden — any drift fails this)', () => {
        // 'alice@example.com' = 17 ASCII bytes; circuit slot is 64.
        const emailBytes = [
            0x61, 0x6c, 0x69, 0x63, 0x65, 0x40, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x2e,
            0x63, 0x6f, 0x6d,
        ];
        const audienceBytes = Array.from(
            new TextEncoder().encode('test-client-id.apps.googleusercontent.com'),
        );
        const pad = <T>(head: T[], n: number, fill: T) => [
            ...head,
            ...Array<T>(n - head.length).fill(fill),
        ];

        expect(buildCircuitInputs(fixtureClaim, fixtureJwt)).toEqual({
            data: { storage: [1, 2, 3], len: 3 },
            base64_decode_offset: 7,
            redc_params_limbs: ['0x1', '0x2'],
            signature_limbs: ['0xa'],
            expected_email: { storage: pad(emailBytes, 64, 0), len: 17 },
            expected_audience: { storage: pad(audienceBytes, 128, 0), len: audienceBytes.length },
            secret: '0x123456789abcdef',
            amount: '0xde0b6b3a7640000',
            merkle_siblings: pad(['0xaa', '0xbb', '0xcc'], 20, '0x0'),
            merkle_path_indices: pad(['0x0', '0x1', '0x0'], 20, '0x0'),
            pubkey_modulus_limbs: ['0xff'],
            merkle_root: '0xabc',
            unlock_time: '0x65f1d3a0',
            recipient: '0x742d35cc6634c0532925a3b844bc9e7595f0bcb1',
        });
    });

    it("substitutes recipient='0x0' when claim has empty recipient (branch)", () => {
        expect(buildCircuitInputs({ ...fixtureClaim, recipient: '' }, fixtureJwt).recipient).toBe(
            '0x0',
        );
    });
});
