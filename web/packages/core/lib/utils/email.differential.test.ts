// @vitest-environment happy-dom
//
// Differential test for the create<->claim email canonicalization unification.
//
// LAUNCH-BLOCKER (funds-lock): @zarf/core historically had two divergent email
// normalizations. The create/whitelist path stripped Gmail dots and `+tags`
// (utils/email.ts `normalizeEmail`), while the leaf/identity path
// (crypto/merkleTree.ts `computeIdentityCommitment`) only did `toLowerCase().trim()`,
// and at CLAIM time the email arrives raw from the verified Google JWT. The Noir
// circuit binds `expected_email` to the JWT `email` claim and derives the leaf's
// `email_hash` from those exact bytes (circuits/src/main.nr lines 136 & 140), so
// any dot/tag stripping on the create side made dotted-Gmail / plus allocations
// PERMANENTLY UNCLAIMABLE.
//
// Owner-approved fix: ONE normalizer = lowercase+trim ONLY, on BOTH sides.
//
// These tests assert:
//   1. `normalizeEmail` no longer strips dots/`+tags` (regression guard).
//   2. The create-side identity commitment (whitelist-normalized email) equals
//      the claim-side identity commitment (raw JWT email) for dotted + plus
//      inputs — i.e. the leaf is actually claimable.
//
// Pedersen hashing needs a window-like global; happy-dom satisfies the
// `if (!browser) throw` guard inside `initBarretenberg()`. WASM init runs once.

import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';
import { computeIdentityCommitment } from '../crypto/merkleTree';

// A fixed epoch secret (the Field path of computeIdentityCommitment). The actual
// value is irrelevant to the differential property; both sides use the same one.
const SECRET = 0x1234n;

describe('normalizeEmail — single canonicalizer (lowercase+trim only)', () => {
    it('does NOT strip Gmail dots (dot-strip is incompatible with JWT-bound claiming)', () => {
        // OLD behavior produced 'alice@gmail.com'; that is the funds-lock bug.
        expect(normalizeEmail('a.l.i.c.e@gmail.com')).toBe('a.l.i.c.e@gmail.com');
        expect(normalizeEmail('Alice.Smith@gmail.com')).toBe('alice.smith@gmail.com');
    });

    it('does NOT strip `+tags`', () => {
        // OLD behavior produced 'bob@example.com'; that is the funds-lock bug.
        expect(normalizeEmail('bob+work@example.com')).toBe('bob+work@example.com');
        expect(normalizeEmail('Bob+Work@x')).toBe('bob+work@x');
    });

    it('still lowercases and trims', () => {
        expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    });
});

describe('differential: create-side leaf email === claim-side identity email', () => {
    // create side: CSV `parseCSV` stores `normalizeEmail(identifier)`, which then
    // flows into `computeIdentityCommitment` when leaves are built.
    // claim side: `discoverEpochs` feeds the RAW JWT email straight into
    // `computeIdentityCommitment`.
    // The two commitments MUST be byte-identical or the allocation is unclaimable.
    const cases: Array<{ label: string; raw: string }> = [
        { label: 'dotted Gmail', raw: 'a.l.i.c.e@gmail.com' },
        { label: 'plus tag', raw: 'bob+work@x' },
        { label: 'mixed case + whitespace', raw: '  Carol.D+News@Gmail.com ' },
    ];

    for (const { label, raw } of cases) {
        it(`yields the same identity commitment for ${label}`, async () => {
            // Create path: email as persisted by the whitelist processor.
            const createEmail = normalizeEmail(raw);
            const createCommitment = await computeIdentityCommitment(createEmail, SECRET);

            // Claim path: raw JWT email, exactly as authStore.gmail.email delivers it.
            const claimCommitment = await computeIdentityCommitment(raw, SECRET);

            expect(claimCommitment).toEqual(createCommitment);
        }, 30_000);
    }
});
