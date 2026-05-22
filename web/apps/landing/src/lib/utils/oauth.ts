/**
 * OAuth URL Utilities for Landing Page
 *
 * Minimal utilities for handling OAuth callback redirect.
 * Full OAuth logic lives in the Claim app.
 */
import type { OAuthState } from '@zarf/core';
import { warn } from '@zarf/core/utils/log';
import { isValidContractAddressShape } from '@zarf/core/utils/addressShape';
export type { OAuthState };

// Landing applies the same shape check as the claim-side callback. Full
// StrKey CRC validation lives in @zarf/core/utils/address and runs at
// claim-time; addressShape is the SDK-free mirror so this import does
// not pull @stellar/stellar-sdk into the landing eager graph.

/**
 * Decodes OAuth state from URL parameter.
 */
function decodeOAuthState(stateParam: string | null): OAuthState | null {
    if (!stateParam) return null;

    try {
        const decoded = JSON.parse(stateParam);

        if (decoded.address && !isValidContractAddressShape(decoded.address)) {
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
