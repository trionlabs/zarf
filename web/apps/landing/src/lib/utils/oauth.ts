/**
 * OAuth URL Utilities for Landing Page
 *
 * Minimal utilities for handling OAuth callback redirect.
 * Full OAuth logic lives in the Claim app.
 */

/** OAuth state passed through redirect */
export interface OAuthState {
    address?: `0x${string}`;
}

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Decodes OAuth state from URL parameter.
 */
function decodeOAuthState(stateParam: string | null): OAuthState | null {
    if (!stateParam) return null;

    try {
        const decoded = JSON.parse(stateParam);

        if (decoded.address && !ETH_ADDRESS_REGEX.test(decoded.address)) {
            console.warn('[OAuth] Invalid address in state, ignoring');
            delete decoded.address;
        }

        return decoded as OAuthState;
    } catch (e) {
        console.warn('[OAuth] Failed to parse state:', e);
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
