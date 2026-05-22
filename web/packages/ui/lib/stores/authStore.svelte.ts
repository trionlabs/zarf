import { browser } from '$app/environment';
import { decodeJwt } from "../utils/googleAuth";
import { STORAGE_KEYS } from "@zarf/core/constants/storage";

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
    expiresAt: null
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
 */
function restoreGmailSession() {
    if (!browser) return;

    const jwt = sessionStorage.getItem(STORAGE_KEYS.GMAIL_JWT);
    if (jwt) {
        try {
            const { payload } = decodeJwt(jwt);
            const now = Math.floor(Date.now() / 1000);

            if (payload.exp < now) {
                console.warn('[AuthStore] Session expired, clearing...');
                clearGmailSession();
            } else {
                gmailState.email = payload.email;
                gmailState.jwt = jwt;
                gmailState.expiresAt = payload.exp;
                gmailState.isAuthenticated = true;
                console.log('[AuthStore] Session restored for:', payload.email);
            }
        } catch (e) {
            console.error('[AuthStore] Failed to restore session:', e);
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
    get gmail() { return gmailState; },

    // Hydration-Safe Getter: Ensures we never show "Authenticated" during SSR/Hydration mismatch
    get isAuthenticated() { return gmailState.isAuthenticated && isHydrated; },

    setGmailSession,
    clearGmailSession,
    restoreGmailSession
};
