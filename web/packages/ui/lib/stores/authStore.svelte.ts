import { browser } from '$app/environment';
import { STORAGE_KEYS } from '@zarf/core/constants/storage';

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
    // Merge new data. The JWT lives in memory only — a persisted copy
    // (session/localStorage) is readable by script injection and outlives
    // its use. A hard refresh simply requires a fresh Google login.
    gmailState = { ...gmailState, ...data, isAuthenticated: true };

    // If setting session on client, also mark as hydrated
    if (browser) {
        isHydrated = true;
    }
}

function clearGmailSession() {
    gmailState = { ...initialGmailState };
    if (browser) {
        // Drop any token persisted by previous app versions.
        sessionStorage.removeItem(STORAGE_KEYS.GMAIL_JWT);
    }
}

// ============================================================================
// Hydration (On App Load)
// ============================================================================

/**
 * Marks the store hydrated. Sessions are no longer persisted (the id_token
 * is memory-only), so there is nothing to restore — but any token written
 * by previous app versions is purged.
 */
function restoreGmailSession(_clientId: string) {
    if (!browser) return;

    sessionStorage.removeItem(STORAGE_KEYS.GMAIL_JWT);
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
