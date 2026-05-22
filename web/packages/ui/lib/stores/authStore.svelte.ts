import { browser } from '$app/environment';
import { decodeJwt, validateGoogleClaims } from '../utils/googleAuth';
import { STORAGE_KEYS } from '@zarf/core/constants/storage';
import { dev, warn, err } from '@zarf/core/utils/log';

/**
 * Authentication Store — Gmail / OIDC session.
 *
 * Wallet state is owned by `walletStore`. There used to be a parallel
 * `walletState` here, but it was orphaned (`setWalletSession` was never
 * called) so it was removed to eliminate the cross-store mirror.
 */

interface GmailSession {
    isAuthenticated: boolean;
    email: string | null;
    jwt: string | null;
    expiresAt: number | null;
}

const initialGmailState: GmailSession = {
    isAuthenticated: false,
    email: null,
    jwt: null,
    expiresAt: null,
};

// ============================================================================
// State (Runes)
// ============================================================================

let gmailState = $state<GmailSession>(initialGmailState);
let isHydrated = $state(false); // Tracks if client-side restoration has completed

// ============================================================================
// Actions
// ============================================================================

function setGmailSession(data: Partial<GmailSession>) {
    // Merge new data
    gmailState = { ...gmailState, ...data, isAuthenticated: true };

    // Persist JWT to sessionStorage (strictly for refresh survival)
    if (browser && data.jwt) {
        sessionStorage.setItem(STORAGE_KEYS.GMAIL_JWT, data.jwt);
    }

    // If setting session on client, also mark as hydrated
    if (browser) {
        isHydrated = true;
    }
}

function clearGmailSession() {
    gmailState = { ...initialGmailState };
    if (browser) {
        sessionStorage.removeItem(STORAGE_KEYS.GMAIL_JWT);
    }
}

// ============================================================================
// Restoration Logic (On App Load)
// ============================================================================

/**
 * Restores session from storage and validates JWT integrity.
 * Always marks isHydrated = true at the end, regardless of session state.
 *
 * @param clientId - Expected `aud` for the stored Google OIDC token.
 *                   Required so the store rejects sessions from a
 *                   different Google client (forged or stale). Missing
 *                   or wrong clientId fails closed via clearGmailSession.
 */
function restoreGmailSession(clientId: string) {
    if (!browser) return;

    // Fail closed when VITE_GOOGLE_CLIENT_ID is unset: validateGoogleClaims
    // would otherwise accept any token whose aud is the empty string, which
    // silently downgrades the audience check from "reject wrong-app tokens"
    // to "accept anything".
    if (!clientId) {
        warn('[AuthStore] VITE_GOOGLE_CLIENT_ID is unset, clearing any stored session');
        clearGmailSession();
        isHydrated = true;
        return;
    }

    const jwt = sessionStorage.getItem(STORAGE_KEYS.GMAIL_JWT);
    if (jwt) {
        try {
            const { payload } = decodeJwt(jwt);
            validateGoogleClaims(payload, { clientId, mode: 'restore' });
            const now = Math.floor(Date.now() / 1000);

            if (payload.exp < now) {
                warn('[AuthStore] Session expired, clearing...');
                clearGmailSession();
            } else {
                gmailState.email = payload.email;
                gmailState.jwt = jwt;
                gmailState.expiresAt = payload.exp;
                gmailState.isAuthenticated = true;
                dev('[AuthStore] Session restored for:', payload.email);
            }
        } catch (e) {
            err('[AuthStore] Failed to restore session:', e);
            clearGmailSession();
        }
    }

    // Always mark as hydrated after restoration attempt
    isHydrated = true;
}

// ============================================================================
// Store Export
// ============================================================================

export const authStore = {
    get gmail() {
        return gmailState;
    },

    // Hydration-Safe Getter: Ensures we never show "Authenticated" during SSR/Hydration mismatch
    get isAuthenticated() {
        return gmailState.isAuthenticated && isHydrated;
    },

    setGmailSession,
    clearGmailSession,
    restoreGmailSession,
};
