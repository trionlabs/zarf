import { describe, expect, it } from 'vitest';
import {
    toHex,
    toHexFromBytes,
    padMerkleProof,
    padEmail,
    buildCircuitInputs,
    TREE_DEPTH,
    MAX_EMAIL_LENGTH,
    type ClaimData,
    type NoirJwtResult,
} from './proofInputs';

// ──────────────────────────────────────────────────────────────────────────
// toHex
// ──────────────────────────────────────────────────────────────────────────

describe('toHex', () => {
    it('passes through strings already prefixed with 0x', () => {
        expect(toHex('0x0')).toBe('0x0');
        expect(toHex('0x1234')).toBe('0x1234');
        expect(toHex('0xabcdef')).toBe('0xabcdef');
        expect(toHex('0x')).toBe('0x'); // edge: bare prefix passes through
    });

    it('converts decimal-string inputs via BigInt', () => {
        expect(toHex('0')).toBe('0x0');
        expect(toHex('1')).toBe('0x1');
        expect(toHex('15')).toBe('0xf');
        expect(toHex('123')).toBe('0x7b');
        expect(toHex('255')).toBe('0xff');
        expect(toHex('256')).toBe('0x100');
    });

    it('converts numbers via BigInt', () => {
        expect(toHex(0)).toBe('0x0');
        expect(toHex(123)).toBe('0x7b');
        expect(toHex(255)).toBe('0xff');
    });

    it('converts bigints via BigInt', () => {
        expect(toHex(0n)).toBe('0x0');
        expect(toHex(123n)).toBe('0x7b');
        // value larger than Number.MAX_SAFE_INTEGER
        expect(toHex(2n ** 64n)).toBe('0x10000000000000000');
    });

    it('does not pad to even length (lowercase, no leading zero)', () => {
        // This is current behavior; tests will fail if we ever switch to padding
        // single-nibble outputs to two-character bytes.
        expect(toHex(1)).toBe('0x1');
        expect(toHex(15)).toBe('0xf');
    });
});

// ──────────────────────────────────────────────────────────────────────────
// toHexFromBytes
// ──────────────────────────────────────────────────────────────────────────

describe('toHexFromBytes', () => {
    it('encodes ASCII bytes as 2-digit lowercase hex', () => {
        // From the function's own docstring fixture
        expect(toHexFromBytes('ABC')).toBe('0x414243');
    });

    it('returns 0x for empty input', () => {
        expect(toHexFromBytes('')).toBe('0x');
    });

    it('encodes UTF-8 multi-byte chars correctly', () => {
        // 'é' = 0xC3 0xA9 in UTF-8
        expect(toHexFromBytes('é')).toBe('0xc3a9');
        // emoji '🔒' = 0xF0 0x9F 0x94 0x92
        expect(toHexFromBytes('🔒')).toBe('0xf09f9492');
    });

    it('zero-pads single-digit byte values', () => {
        // 0x07 (BEL) — must be "07", not "7"
        expect(toHexFromBytes('\x07')).toBe('0x07');
        expect(toHexFromBytes('\x00')).toBe('0x00');
    });
});

// ──────────────────────────────────────────────────────────────────────────
// padMerkleProof
// ──────────────────────────────────────────────────────────────────────────

describe('padMerkleProof', () => {
    it('pads empty arrays to TREE_DEPTH with 0x0 entries', () => {
        const { siblings, indices } = padMerkleProof([], []);
        expect(siblings).toHaveLength(TREE_DEPTH);
        expect(indices).toHaveLength(TREE_DEPTH);
        expect(siblings.every(s => s === '0x0')).toBe(true);
        expect(indices.every(i => i === '0x0')).toBe(true);
    });

    it('pads partial arrays to TREE_DEPTH', () => {
        const inSibs = ['0xaa', '0xbb', '0xcc'];
        const inIdx = ['0x0', '0x1', '0x0'];
        const { siblings, indices } = padMerkleProof(inSibs, inIdx);

        expect(siblings).toHaveLength(TREE_DEPTH);
        expect(indices).toHaveLength(TREE_DEPTH);
        expect(siblings.slice(0, 3)).toEqual(['0xaa', '0xbb', '0xcc']);
        expect(siblings.slice(3).every(s => s === '0x0')).toBe(true);
        expect(indices.slice(0, 3)).toEqual(['0x0', '0x1', '0x0']);
        expect(indices.slice(3).every(i => i === '0x0')).toBe(true);
    });

    it('passes through already-full arrays without truncation, normalized through toHex', () => {
        const inSibs = Array.from({ length: TREE_DEPTH }, (_, i) => `0x${(i + 1).toString(16)}`);
        const inIdx = Array.from({ length: TREE_DEPTH }, (_, i) => (i % 2).toString());
        const { siblings, indices } = padMerkleProof(inSibs, inIdx);

        expect(siblings).toHaveLength(TREE_DEPTH);
        expect(indices).toHaveLength(TREE_DEPTH);
        expect(siblings).toEqual(inSibs);
        // decimal-string indices ('0', '1') should be normalized via toHex
        expect(indices[0]).toBe('0x0');
        expect(indices[1]).toBe('0x1');
    });

    it('normalizes decimal-string siblings via toHex', () => {
        const { siblings } = padMerkleProof(['0', '1', '255'], []);
        expect(siblings[0]).toBe('0x0');
        expect(siblings[1]).toBe('0x1');
        expect(siblings[2]).toBe('0xff');
    });

    it('does not mutate input arrays', () => {
        const inSibs = ['0xaa'];
        const inIdx = ['0x1'];
        padMerkleProof(inSibs, inIdx);
        expect(inSibs).toEqual(['0xaa']);
        expect(inIdx).toEqual(['0x1']);
    });

    it('honors a custom depth parameter', () => {
        const { siblings, indices } = padMerkleProof(['0xa'], ['0x0'], 4);
        expect(siblings).toHaveLength(4);
        expect(indices).toHaveLength(4);
        expect(siblings).toEqual(['0xa', '0x0', '0x0', '0x0']);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// padEmail
// ──────────────────────────────────────────────────────────────────────────

describe('padEmail', () => {
    it('pads short emails to MAX_EMAIL_LENGTH with zero bytes', () => {
        const { storage, len } = padEmail('abc');
        expect(storage).toHaveLength(MAX_EMAIL_LENGTH);
        // First 3 bytes are ASCII codes for a, b, c
        expect(storage.slice(0, 3)).toEqual([0x61, 0x62, 0x63]);
        // Rest are zeros
        expect(storage.slice(3).every(b => b === 0)).toBe(true);
        // len reflects the original *string* length (not byte length)
        expect(len).toBe(3);
    });

    it('returns all-zero storage for empty input', () => {
        const { storage, len } = padEmail('');
        expect(storage).toHaveLength(MAX_EMAIL_LENGTH);
        expect(storage.every(b => b === 0)).toBe(true);
        expect(len).toBe(0);
    });

    it('preserves a 64-byte email exactly without further padding', () => {
        const email = 'a'.repeat(64);
        const { storage, len } = padEmail(email);
        expect(storage).toHaveLength(64);
        expect(storage.every(b => b === 0x61)).toBe(true);
        expect(len).toBe(64);
    });

    it('len uses string length, not UTF-8 byte length (current behavior)', () => {
        // The original inline implementation used `email.length`, which counts
        // UTF-16 code units, not bytes. Locking that in so any future change
        // to byte-length is a deliberate decision, not an accident.
        const email = 'é';                      // 1 char, 2 UTF-8 bytes
        const { storage, len } = padEmail(email);
        expect(len).toBe(1);
        expect(storage[0]).toBe(0xc3);
        expect(storage[1]).toBe(0xa9);
    });

    it('honors a custom length parameter', () => {
        const { storage, len } = padEmail('hi', 8);
        expect(storage).toHaveLength(8);
        expect(storage.slice(0, 2)).toEqual([0x68, 0x69]);
        expect(storage.slice(2).every(b => b === 0)).toBe(true);
        expect(len).toBe(2);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// buildCircuitInputs — characterization of the exact circuit input shape
// ──────────────────────────────────────────────────────────────────────────

const fixtureClaim: ClaimData = {
    email: 'alice@example.com',
    salt: '0x123456789abcdef',
    amount: '0xde0b6b3a7640000',          // 1e18 in hex
    merkleProof: {
        siblings: ['0xaa', '0xbb', '0xcc'],
        indices: ['0x0', '0x1', '0x0'],
    },
    merkleRoot: '0xabc',
    recipient: '0x742d35cc6634c0532925a3b844bc9e7595f0bcb1',
    unlockTime: '0x65f1d3a0',
};

const fixtureJwt: NoirJwtResult = {
    base64_decode_offset: 7,
    redc_params_limbs: ['0x1', '0x2', '0x3'],
    signature_limbs: ['0xa', '0xb'],
    pubkey_modulus_limbs: ['0xff', '0xee'],
    data: {
        storage: [1, 2, 3, 4, 5],
        len: 5,
    },
};

describe('buildCircuitInputs', () => {
    it('produces the exact object shape the circuit expects', () => {
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);

        // Top-level keys, in the order they currently appear (locked in).
        expect(Object.keys(inputs)).toEqual([
            'data',
            'base64_decode_offset',
            'redc_params_limbs',
            'signature_limbs',
            'expected_email',
            'secret',
            'amount',
            'merkle_siblings',
            'merkle_path_indices',
            'pubkey_modulus_limbs',
            'merkle_root',
            'unlock_time',
            'recipient',
        ]);
    });

    it('forwards JWT-derived fields verbatim', () => {
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);
        expect(inputs.data).toEqual({ storage: [1, 2, 3, 4, 5], len: 5 });
        expect(inputs.base64_decode_offset).toBe(7);
        expect(inputs.redc_params_limbs).toEqual(['0x1', '0x2', '0x3']);
        expect(inputs.signature_limbs).toEqual(['0xa', '0xb']);
        expect(inputs.pubkey_modulus_limbs).toEqual(['0xff', '0xee']);
    });

    it('pads expected_email to MAX_EMAIL_LENGTH with the original string length', () => {
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);
        expect(inputs.expected_email.storage).toHaveLength(MAX_EMAIL_LENGTH);
        expect(inputs.expected_email.len).toBe(fixtureClaim.email.length);
        // First N bytes are the email ASCII bytes
        const expectedBytes = Array.from(new TextEncoder().encode(fixtureClaim.email));
        expect(inputs.expected_email.storage.slice(0, expectedBytes.length))
            .toEqual(expectedBytes);
    });

    it('passes salt through as-is (no toHex, since it is already a field hex)', () => {
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);
        expect(inputs.secret).toBe(fixtureClaim.salt);
    });

    it('normalizes amount, merkle_root, unlock_time through toHex', () => {
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);
        expect(inputs.amount).toBe('0xde0b6b3a7640000');
        expect(inputs.merkle_root).toBe('0xabc');
        expect(inputs.unlock_time).toBe('0x65f1d3a0');
    });

    it('pads merkle siblings and indices to TREE_DEPTH', () => {
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);
        expect(inputs.merkle_siblings).toHaveLength(TREE_DEPTH);
        expect(inputs.merkle_path_indices).toHaveLength(TREE_DEPTH);
        expect(inputs.merkle_siblings.slice(0, 3)).toEqual(['0xaa', '0xbb', '0xcc']);
        expect(inputs.merkle_siblings.slice(3).every(s => s === '0x0')).toBe(true);
    });

    it("substitutes recipient='0x0' when the claim has empty recipient", () => {
        const inputs = buildCircuitInputs({ ...fixtureClaim, recipient: '' }, fixtureJwt);
        expect(inputs.recipient).toBe('0x0');
    });

    it('passes recipient through unchanged when present (no toHex)', () => {
        // Locked-in current behavior: recipient is NOT normalized through toHex.
        // Mixed-case is preserved; if we ever pipe it through toHex this fails.
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);
        expect(inputs.recipient).toBe('0x742d35cc6634c0532925a3b844bc9e7595f0bcb1');
    });

    it('is referentially independent of input arrays (later mutation does not leak through)', () => {
        const claim: ClaimData = {
            ...fixtureClaim,
            merkleProof: {
                siblings: ['0xaa'],
                indices: ['0x0'],
            },
        };
        const inputs = buildCircuitInputs(claim, fixtureJwt);
        claim.merkleProof.siblings.push('0xff');
        // The output's siblings should NOT have grown.
        expect(inputs.merkle_siblings).toHaveLength(TREE_DEPTH);
    });

    it('snapshot of the full output for a known fixture', () => {
        // Single golden fixture — locks the exact serialized shape so any
        // future change is forced to be deliberate.
        const inputs = buildCircuitInputs(fixtureClaim, fixtureJwt);
        expect(inputs).toMatchInlineSnapshot(`
          {
            "amount": "0xde0b6b3a7640000",
            "base64_decode_offset": 7,
            "data": {
              "len": 5,
              "storage": [
                1,
                2,
                3,
                4,
                5,
              ],
            },
            "expected_email": {
              "len": 17,
              "storage": [
                97,
                108,
                105,
                99,
                101,
                64,
                101,
                120,
                97,
                109,
                112,
                108,
                101,
                46,
                99,
                111,
                109,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
              ],
            },
            "merkle_path_indices": [
              "0x0",
              "0x1",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
            ],
            "merkle_root": "0xabc",
            "merkle_siblings": [
              "0xaa",
              "0xbb",
              "0xcc",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
              "0x0",
            ],
            "pubkey_modulus_limbs": [
              "0xff",
              "0xee",
            ],
            "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f0bcb1",
            "redc_params_limbs": [
              "0x1",
              "0x2",
              "0x3",
            ],
            "secret": "0x123456789abcdef",
            "signature_limbs": [
              "0xa",
              "0xb",
            ],
            "unlock_time": "0x65f1d3a0",
          }
        `);
    });
});
