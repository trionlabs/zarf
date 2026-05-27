import type { JWTPayload } from '../types';

/**
 * Google OIDC accepts both bare and full-URL issuers in the wild; the
 * spec lists `https://accounts.google.com` but tokens issued via newer
 * flows sometimes carry the bare form. Accepting both matches what the
 * google-auth-library and Firebase SDKs do.
 */
export const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/**
 * Asserts a decoded Google JWT's `iss`, `aud`, `exp`, `email_verified`,
 * and (mode-dependent) `nonce` claims at the trust boundary.
 *
 * Discriminated by `mode`:
 *
 * - `mode: 'callback'` — a fresh OAuth callback is being processed.
 *   `expectedNonce` is required (non-nullable string); the payload's
 *   `nonce` claim must match. Pairs with the call-site guard that
 *   throws if no stored nonce exists, so an attacker cannot land a
 *   captured token in a cold tab.
 * - `mode: 'restore'` — a previously-validated session is being
 *   rehydrated from storage. The nonce was already verified when the
 *   token was first accepted, so this path validates iss + aud only.
 *
 * Does NOT verify the JWT signature — that still happens in the Noir
 * circuit. This function only checks the structured claims an attacker
 * with a forged-but-unsigned token could lie about, which is enough
 * to reject the trivial "wrong-Google-app JWT" + replay attack classes.
 *
 * @throws {Error} If iss is not a Google issuer
 * @throws {Error} If aud does not match the configured client ID
 * @throws {Error} In callback mode, if payload.nonce mismatches expectedNonce
 */
export function validateGoogleClaims(
    payload: JWTPayload,
    opts:
        | { clientId: string; mode: 'callback'; expectedNonce: string }
        | { clientId: string; mode: 'restore' },
): void {
    if (!GOOGLE_ISSUERS.has(payload.iss)) {
        throw new Error(`Invalid JWT issuer: ${payload.iss}`);
    }
    if (payload.aud !== opts.clientId) {
        throw new Error('JWT audience does not match expected client ID');
    }
    if (payload.email_verified !== true) {
        throw new Error('JWT email is not verified by Google');
    }
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new Error('JWT is expired');
    }
    if (opts.mode === 'callback') {
        if (payload.nonce !== opts.expectedNonce) {
            throw new Error('JWT nonce does not match the stored OAuth nonce');
        }
    }
}
