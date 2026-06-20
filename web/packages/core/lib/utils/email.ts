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
 * Canonicalize an email for identity hashing — the SINGLE normalizer shared by
 * the create (whitelist/leaf) and claim (identity-commitment/proof) paths.
 *
 * Lowercase + trim ONLY. Deliberately does NOT strip Gmail dots or `+tags`.
 *
 * Why no dot/plus stripping: at CLAIM time the email is the verified Google JWT
 * `email` claim, and the Noir circuit binds it via
 * `jwt.assert_claim_string("email", expected_email)` and derives the leaf's
 * `email_hash` from those exact bytes (circuits/src/main.nr). Google does not
 * canonicalize the JWT email (it returns the user's literal address, e.g.
 * `a.l.i.c.e@gmail.com`). If create pre-stripped dots/tags, the leaf's
 * `email_hash` would never match the JWT-derived hash, and the allocation would
 * be permanently unclaimable. So the leaf side MUST hash the same bytes the JWT
 * carries — lowercase+trim is the only safe transform.
 *
 * @param email - Raw email address
 * @returns Canonical email for hashing (lowercase, trimmed)
 *
 * @example
 * ```typescript
 * normalizeEmail('Alice.Smith@gmail.com') // 'alice.smith@gmail.com'
 * normalizeEmail('  Bob+Work@Example.com ') // 'bob+work@example.com'
 * ```
 */
export function normalizeEmail(email: string): string {
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

    const normalized = normalizeEmail(email);
    const bytes = stringToBytes(normalized, 64);
    const hash = await pedersenHashBytes(bytes);

    return '0x' + hash.toString(16);
}
