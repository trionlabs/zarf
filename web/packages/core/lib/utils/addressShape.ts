/**
 * SSR-safe shape-only Stellar address validators.
 *
 * Mirror of address.ts but with no @stellar/stellar-sdk dependency, so
 * importing modules don't drag the SDK + buffer polyfill into SSR
 * module evaluation. Use these when the caller only needs regex-grade
 * shape validation (UX feedback while a user types, CSV pre-screen).
 *
 * For checksum + version-byte verification (the real StrKey decode)
 * use the StrKey-backed exports in address.ts. Those are still required
 * before signing or building a transaction. Shape validation only
 * confirms "looks like a Stellar address"; bad checksums slip through
 * and surface at the transaction-build step instead. Strict CRC is
 * also enforced at the indexer for read paths (see assertAddress in
 * web/apps/indexer/src/index.ts), so /vestings/:address-style routes
 * reject malformed inputs server-side regardless of what passed here.
 *
 * SEP-0023 StrKey: 1 version char + 55 base32 chars = 56 total.
 * G... = ed25519 account ID
 * C... = Soroban contract ID
 */

const BASE32_BODY = '[A-Z2-7]{55}';

const CONTRACT_RE = new RegExp(`^C${BASE32_BODY}$`);
const ACCOUNT_RE = new RegExp(`^G${BASE32_BODY}$`);

export function isValidContractAddressShape(address: string): boolean {
    return typeof address === 'string' && CONTRACT_RE.test(address);
}

export function isValidAccountAddressShape(address: string): boolean {
    return typeof address === 'string' && ACCOUNT_RE.test(address);
}

export function isValidAddressShape(address: string): boolean {
    return isValidContractAddressShape(address) || isValidAccountAddressShape(address);
}
