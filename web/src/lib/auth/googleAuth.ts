/**
 * Google OAuth OIDC Authentication Utilities
 * 
 * This module handles Google OAuth 2.0 implicit flow for obtaining JWTs.
 * Used for email-based whitelist verification with privacy preservation.
 * 
 * @module auth/googleAuth
 */

import type { DecodedJWT, GooglePublicKey, JWTHeader, JWTPayload, OAuthState } from '../types';

// ============================================================================
// Constants
// ============================================================================

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Regex pattern for validating Ethereum addresses */
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// ============================================================================
// Browser Environment Guards
// ============================================================================

/**
 * Ensures function is called in browser environment
 * @throws {Error} If called during SSR
 */
function assertBrowser(): void {
    if (typeof window === 'undefined') {
        throw new Error('This function can only be called in the browser');
    }
}

// ============================================================================
// OAuth State Utilities
// ============================================================================

/**
 * Encodes OAuth state object for URL transmission.
 * Used to preserve context (e.g., contractAddress) through OAuth redirect.
 * 
 * @param state - State object to encode
 * @returns URL-safe encoded string, or null if state is empty
 * 
 * @example
 * ```typescript
 * const encoded = encodeOAuthState({ address: '0x123...' });
 * // Use encoded in OAuth URL
 * ```
 */
export function encodeOAuthState(state: OAuthState): string | null {
    // Filter out undefined/null values
    const filtered = Object.fromEntries(
        Object.entries(state).filter(([, v]) => v !== undefined && v !== null)
    );

    if (Object.keys(filtered).length === 0) {
        return null;
    }

    // Note: Do NOT encodeURIComponent here - URLSearchParams.append handles encoding
    return JSON.stringify(filtered);
}

/**
 * Decodes OAuth state from URL parameter.
 * Safely parses the state with error handling.
 * 
 * @param stateParam - State string from URLSearchParams.get() (already decoded)
 * @returns Decoded state object, or null if invalid/empty
 * 
 * @example
 * ```typescript
 * const params = new URLSearchParams(window.location.hash.substring(1));
 * const state = decodeOAuthState(params.get('state'));
 * if (state?.address) {
 *   // Restore contract address
 * }
 * ```
 */
export function decodeOAuthState(stateParam: string | null): OAuthState | null {
    if (!stateParam) return null;

    try {
        // Note: URLSearchParams.get() already decodes the value, so just JSON.parse
        const decoded = JSON.parse(stateParam);

        // Validate address format if present
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

// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Initiates Google OAuth login using implicit flow.
 * Redirects user to Google's authentication page.
 * 
 * @param clientId - Google OAuth Client ID from console.cloud.google.com
 * @param redirectUri - Redirect URI (must match Google Console config exactly)
 * @param state - Optional state for preserving context through redirect
 * @param nonce - Optional nonce for replay protection (auto-generated if not provided)
 * 
 * @throws {Error} If called during SSR (server-side rendering)
 * 
 * @example
 * ```typescript
 * const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
 * const REDIRECT_URI = window.location.origin;
 * initiateGoogleLogin(CLIENT_ID, REDIRECT_URI);
 * ```
 */
export function initiateGoogleLogin(
    clientId: string,
    redirectUri: string,
    state: string | null = null,
    nonce: string | null = null
): void {
    assertBrowser();

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce: nonce || crypto.randomUUID(),
    });

    if (state) {
        params.append('state', state);
    }

    window.location.href = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Convenience wrapper for initiateGoogleLogin using environment variables.
 * Preserves contractAddress through OAuth redirect via state parameter.
 * 
 * @param contractAddress - Optional contract address to preserve through redirect
 * 
 * @throws {Error} If VITE_GOOGLE_CLIENT_ID is not defined
 * @throws {Error} If called during SSR
 * 
 * @example
 * ```typescript
 * // Basic usage
 * redirectToGoogle();
 * 
 * // With contract address preservation
 * redirectToGoogle('0x1234...abcd');
 * ```
 */
export function redirectToGoogle(contractAddress?: string): void {
    assertBrowser();

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
        throw new Error('VITE_GOOGLE_CLIENT_ID is not defined in environment variables');
    }

    // Use Root Origin WITH trailing slash (http://localhost:5173/) to match Google Console config.
    // The Landing Page (+page.svelte) will handle the callback and forward to /claim with state.
    const redirectUri = `${window.location.origin}/`;

    // Build state with optional contract address
    const oauthState: OAuthState = {};
    if (contractAddress) {
        if (ETH_ADDRESS_REGEX.test(contractAddress)) {
            oauthState.address = contractAddress as `0x${string}`;
        } else {
            console.warn('[Auth] Invalid contract address format, not preserving');
        }
    }

    const encodedState = encodeOAuthState(oauthState);
    initiateGoogleLogin(clientId, redirectUri, encodedState);
}

// ============================================================================
// URL Fragment Utilities
// ============================================================================

/**
 * Extracts the id_token from URL fragment after OAuth redirect.
 * Google returns the token in the URL hash (#id_token=...).
 * 
 * @returns The JWT id_token string, or null if not found
 * 
 * @throws {Error} If called during SSR
 * 
 * @example
 * ```typescript
 * onMount(() => {
 *   const token = extractTokenFromUrl();
 *   if (token) {
 *     // User just authenticated
 *     const decoded = decodeJwt(token);
 *     console.log(decoded.payload.email);
 *   }
 * });
 * ```
 */
export function extractTokenFromUrl(): string | null {
    assertBrowser();

    const hash = window.location.hash.substring(1); // Remove leading '#'
    const params = new URLSearchParams(hash);
    return params.get('id_token');
}

/**
 * Extracts OAuth state from URL fragment after redirect.
 * 
 * @returns Decoded OAuthState object, or null if not found/invalid
 * 
 * @throws {Error} If called during SSR
 * 
 * @example
 * ```typescript
 * const state = extractStateFromUrl();
 * if (state?.address) {
 *   // Restore contract address in URL
 *   goto(`/claim?address=${state.address}`);
 * }
 * ```
 */
export function extractStateFromUrl(): OAuthState | null {
    assertBrowser();

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return decodeOAuthState(params.get('state'));
}

/**
 * Clears the URL fragment (removes token from URL bar for security).
 * Call this after extracting the token to clean up the URL.
 * 
 * @throws {Error} If called during SSR
 * 
 * @example
 * ```typescript
 * const token = extractTokenFromUrl();
 * if (token) {
 *   clearUrlFragment(); // Clean URL
 *   // Process token...
 * }
 * ```
 */
export function clearUrlFragment(): void {
    assertBrowser();

    history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
    );
}

// ============================================================================
// JWT Utilities
// ============================================================================

/**
 * Decodes a JWT without verification.
 * 
 * WARNING: This does NOT verify the signature. Verification happens in the
 * ZK circuit (Noir) using the public key. This function is only for extracting
 * claims for display purposes.
 * 
 * @param jwt - The JWT string (format: header.payload.signature)
 * @returns Decoded header and payload
 * 
 * @throws {Error} If JWT format is invalid (not 3 parts)
 * 
 * @example
 * ```typescript
 * const token = extractTokenFromUrl();
 * const decoded = decodeJwt(token);
 * console.log(decoded.payload.email); // user@example.com
 * console.log(decoded.header.kid);    // Key ID for verification
 * ```
 */
export function decodeJwt(jwt: string): DecodedJWT {
    const parts = jwt.split('.');

    if (parts.length !== 3) {
        throw new Error(`Invalid JWT format: expected 3 parts, got ${parts.length}`);
    }

    try {
        // Base64url decode (replace URL-safe chars, then decode)
        const base64UrlDecode = (str: string): string => {
            const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
            return atob(base64);
        };

        const header = JSON.parse(base64UrlDecode(parts[0])) as JWTHeader;
        const payload = JSON.parse(base64UrlDecode(parts[1])) as JWTPayload;

        return { header, payload };
    } catch (error) {
        throw new Error(`Failed to decode JWT: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
}

// ============================================================================
// Public Key Fetching
// ============================================================================

/**
 * Fetches Google's public keys (JWKs) for JWT verification.
 * These keys rotate periodically, so fetch fresh for each verification.
 * 
 * @returns Array of Google's public keys in JWK format
 * 
 * @throws {Error} If fetch fails or response is invalid
 * 
 * @example
 * ```typescript
 * const keys = await fetchGooglePublicKeys();
 * const decoded = decodeJwt(token);
 * const publicKey = findKeyById(keys, decoded.header.kid);
 * // Use publicKey for ZK proof generation
 * ```
 */
export async function fetchGooglePublicKeys(): Promise<GooglePublicKey[]> {
    try {
        const response = await fetch(GOOGLE_CERTS_URL);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.keys || !Array.isArray(data.keys)) {
            throw new Error('Invalid response format: missing keys array');
        }

        return data.keys as GooglePublicKey[];
    } catch (error) {
        throw new Error(
            `Failed to fetch Google public keys: ${error instanceof Error ? error.message : 'unknown error'}`
        );
    }
}

/**
 * Finds the correct public key for a JWT based on its Key ID (kid).
 * 
 * @param keys - Array of JWKs from fetchGooglePublicKeys()
 * @param kid - Key ID from JWT header
 * @returns The matching public key, or null if not found
 * 
 * @example
 * ```typescript
 * const keys = await fetchGooglePublicKeys();
 * const decoded = decodeJwt(myToken);
 * const publicKey = findKeyById(keys, decoded.header.kid);
 * 
 * if (!publicKey) {
 *   throw new Error('Could not find matching public key');
 * }
 * ```
 */
export function findKeyById(
    keys: GooglePublicKey[],
    kid: string
): GooglePublicKey | null {
    return keys.find((key) => key.kid === kid) || null;
}
