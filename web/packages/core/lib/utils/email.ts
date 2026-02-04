/**
 * Email Normalization & Hashing Utilities
 *
 * Provides consistent email normalization and hashing for identity verification.
 * Used by both create and claim apps to ensure matching identity commitments.
 *
 * @module utils/email
 */

/**
 * Normalize email for consistent hashing
 * - Lowercase
 * - Trim whitespace
 * - Remove dots from Gmail local part (Gmail ignores dots)
 * - Remove plus addressing (alice+tag@co.com → alice@co.com)
 *
 * @param email - Raw email address
 * @returns Normalized email for hashing
 *
 * @example
 * ```typescript
 * normalizeEmail('Alice.Smith@gmail.com') // 'alicesmith@gmail.com'
 * normalizeEmail('bob+work@example.com')  // 'bob@example.com'
 * ```
 */
export function normalizeEmail(email: string): string {
    let e = email.toLowerCase().trim();

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
