/**
 * Email Normalization, Validation & Hashing Utilities
 *
 * Provides consistent email handling for identity verification.
 * Used by both create and claim apps to ensure matching identity commitments.
 *
 * @module utils/email
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lexical email validation: requires `local@domain.tld` shape.
 * Single source of truth — replaces drifted local copies in csvProcessor
 * (which accepted `a@b`) and inputValidator.
 */
export function isValidEmail(email: string): boolean {
    return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

/**
 * Normalize email for consistent hashing
 * - Lowercase
 * - Trim whitespace
 * - Canonicalize googlemail.com to gmail.com (same Google account namespace)
 * - Remove dots from Gmail local part (Gmail ignores dots)
 * - Remove plus addressing (alice+tag@co.com → alice@co.com)
 *
 * @param email - Raw email address
 * @returns Normalized email for hashing
 *
 * @example
 * ```typescript
 * normalizeEmail('Alice.Smith@gmail.com')  // 'alicesmith@gmail.com'
 * normalizeEmail('alice@googlemail.com')   // 'alice@gmail.com'
 * normalizeEmail('bob+work@example.com')   // 'bob@example.com'
 * ```
 */
export function normalizeEmail(email: string): string {
    let e = email.toLowerCase().trim();

    // Legacy UK/DE Google accounts live under googlemail.com but are the same
    // account namespace as gmail.com; the sender may know the recipient under
    // either domain while the Google JWT reports the registered one.
    if (e.endsWith('@googlemail.com')) {
        e = e.slice(0, e.lastIndexOf('@')) + '@gmail.com';
    }

    // Gmail: dots in local part are ignored
    if (e.endsWith('@gmail.com')) {
        const [local, domain] = e.split('@');
        e = local.replace(/\./g, '') + '@' + domain;
    }

    // Strip plus addressing: alice+tag@co.com → alice@co.com
    const plusIdx = e.indexOf('+');
    if (plusIdx > 0) {
        const atIdx = e.indexOf('@');
        e = e.slice(0, plusIdx) + e.slice(atIdx);
    }

    return e;
}

/**
 * Canonical email form for the MERKLE LEAF / identity commitment / circuit
 * witness. MUST be derivable from the literal Google id_token `email` claim:
 * the circuit asserts `expected_email == jwt.email` byte-exact
 * (circuits/src/main.nr) and hashes that exact value into the leaf, so the only
 * safe transform is lowercase + trim (Google already lowercases the claim).
 * Do NOT strip Gmail dots / plus-tags / remap googlemail here — the recipient's
 * JWT carries the un-normalized form, so any such rewrite makes the committed
 * leaf unmatchable in-circuit and strands the recipient (finding N3-1).
 *
 * `normalizeEmail` (dot/plus/googlemail folding) is for the VISIBILITY /
 * emailHashes discovery filter ONLY — never for the leaf/commitment/witness.
 */
export function canonicalizeEmailForCommitment(email: string): string {
    return email.toLowerCase().trim();
}

/**
 * Compute Pedersen hash of an email for privacy-preserving filtering.
 * Uses the same algorithm across create and claim apps.
 *
 * **BROWSER ONLY** - Uses WASM-based Pedersen hashing that requires browser environment.
 *
 * @param email - Email address (will be normalized)
 * @returns Hex-encoded hash string (0x prefixed)
 * @throws {Error} If called in server-side context
 */
export async function hashEmail(email: string): Promise<string> {
    if (typeof window === 'undefined') {
        throw new Error('hashEmail() can only be called in browser environment');
    }

    const { pedersenHashBytes, stringToBytes } = await import('../crypto/merkleTree');

    // emailHashes is a VISIBILITY/discovery filter only (not a claim gate), so
    // dot/plus/googlemail folding here is fine; the claim leaf uses
    // canonicalizeEmailForCommitment instead (finding N3-1).
    const normalized = normalizeEmail(email);
    const bytes = stringToBytes(normalized, 64);
    const hash = await pedersenHashBytes(bytes);

    return '0x' + hash.toString(16);
}
