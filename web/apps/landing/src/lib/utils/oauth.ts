/**
 * OAuth URL Utilities for Landing Page
 *
 * Minimal utilities for handling OAuth callback redirect.
 * Full OAuth logic lives in the Claim app.
 */
import type { OAuthState } from '@zarf/core';
import { warn } from '@zarf/core/utils/log';
export type { OAuthState };

// Format-only Stellar contract address shape check. Mirrors the shared
// decoder at packages/ui/lib/utils/googleAuth.ts:18 so the landing-only
// callback applies the same validation as the claim-side flow. Full
// StrKey CRC validation lives in @zarf/core/utils/address and runs at
// claim-time; importing it here would pull @stellar/stellar-sdk into
// the landing eager graph.
const CONTRACT_ADDRESS_REGEX = /^C[A-Z2-7]{55}$/;

/**
 * Decodes OAuth state from URL parameter.
 */
function decodeOAuthState(stateParam: string | null): OAuthState | null {
    if (!stateParam) return null;

    try {
        const decoded = JSON.parse(stateParam);

        if (decoded.address && !CONTRACT_ADDRESS_REGEX.test(decoded.address)) {
            warn('[OAuth] Invalid address in state, ignoring');
            delete decoded.address;
        }

        return decoded as OAuthState;
    } catch (e) {
        warn('[OAuth] Failed to parse state:', e);
        return null;
    }
}

/**
 * Extracts OAuth state from URL fragment after redirect.
 */
export function extractStateFromUrl(): OAuthState | null {
    if (typeof window === 'undefined') return null;

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return decodeOAuthState(params.get('state'));
}
