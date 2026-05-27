// @vitest-environment happy-dom
//
// Pedersen hashing requires a window-like global; happy-dom satisfies the
// `if (!browser) throw` guard inside `initBarretenberg()`. WASM init runs
// in ~250 ms — fine for a small smoke suite.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringToBytes, computeLeaf, computeIdentityCommitment, hashAudience } from './merkleTree';

describe('stringToBytes', () => {
    it('encodes ASCII into a fixed-length byte array, zero-padded', () => {
        const bytes = stringToBytes('abc', 8);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(bytes)).toEqual([0x61, 0x62, 0x63, 0, 0, 0, 0, 0]);
    });

    it('truncates inputs longer than maxLength; preserves UTF-8 byte sequences', () => {
        expect(Array.from(stringToBytes('abcdef', 3))).toEqual([0x61, 0x62, 0x63]);
        // 'é' is 2 bytes in UTF-8 — function passes raw bytes through, no string-length confusion
        expect(Array.from(stringToBytes('é', 4))).toEqual([0xc3, 0xa9, 0, 0]);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// Pedersen hash chain — the highest-leverage thing to lock down.
//
// `computeLeaf` and `computeIdentityCommitment` produce field elements that
// MUST match the on-chain Noir circuit. Any change to: padding length,
// hash generator index, field order, or the underlying bb.js version, will
// silently break every claim. Snapshot tests on a known fixture are the
// minimum bar — if the assertion fires, the algorithm shifted relative to
// the circuit and someone needs to look.
// ──────────────────────────────────────────────────────────────────────────

describe('computeIdentityCommitment (golden snapshot)', () => {
    it('hashes (email, code) deterministically', async () => {
        // Same input → same output. Locks the (email_bytes, code_field) layout.
        const c = await computeIdentityCommitment('alice@example.com', '0x1234');
        expect(c.toString()).toMatchInlineSnapshot(
            `"7529356843672351366546949883630209778154757156384270834038565410668756000102"`,
        );

        // Determinism guard
        const c2 = await computeIdentityCommitment('alice@example.com', '0x1234');
        expect(c2).toEqual(c);
    }, 30_000);
});

describe('computeLeaf (golden snapshot)', () => {
    it('hashes (email, amount, salt, unlockTime) deterministically', async () => {
        const leaf = await computeLeaf(
            'alice@example.com',
            10n ** 18n, // 1e18 wei
            0x1234n,
            1_700_086_400, // unix seconds
        );
        expect(leaf.toString()).toMatchInlineSnapshot(
            `"7673146463851840154926809133587151323101606115910987893633764370302781377969"`,
        );
    }, 30_000);
});

describe('Zarf proof fixture public input layout', () => {
    it('locks the 25-field layout and audience hash index', async () => {
        const fixtureRoot = resolve(
            process.cwd(),
            '../../../contracts/soroban/zarf/vesting/tests/fixtures/zarf-stellar-recipient',
        );
        const publicInputs = readFileSync(resolve(fixtureRoot, 'public_inputs'));
        const metadata = JSON.parse(readFileSync(resolve(fixtureRoot, 'metadata.json'), 'utf8')) as {
            audience_hash: `0x${string}`;
        };

        expect(publicInputs).toHaveLength(25 * 32);
        const audienceHashField = `0x${publicInputs.subarray(23 * 32, 24 * 32).toString('hex')}`;
        expect(audienceHashField).toBe(metadata.audience_hash);
        expect(await hashAudience('test-client-id')).toBe(metadata.audience_hash);
    }, 30_000);
});
