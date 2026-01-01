import { browser } from '$app/environment';
import type { Address } from 'viem';
import { decodeJwt } from '$lib/auth/googleAuth';
import { STORAGE_KEYS } from '$lib/constants/storage';

/**
 * Authentication Store
 * 
 * Manages the "Dual-Identity" state:
 * 1. Gmail Session (Who I am) -> Proven via OIDC
 * 2. Wallet Session (Where I want funds) -> Proven via Connector
 */

interface GmailSession {
    isAuthenticated: boolean;
    email: string | null;
    jwt: string | null;
    expiresAt: number | null;
}

interface WalletSession {
    isConnected: boolean;
    address: Address | null;
    chainId: number | null;
}

const initialGmailState: GmailSession = {
    isAuthenticated: false,
    email: null,
    jwt: null,
    expiresAt: null
};

const initialWalletState: WalletSession = {
    isConnected: false,
    address: null,
    chainId: null
};

// ============================================================================
// State (Runes)
// ============================================================================

let gmailState = $state<GmailSession>(initialGmailState);
let walletState = $state<WalletSession>(initialWalletState);
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

function setWalletSession(data: Partial<WalletSession>) {
    walletState = { ...walletState, ...data };
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
    get wallet() { return walletState; },

    // Hydration-Safe Getter: Ensures we never show "Authenticated" during SSR/Hydration mismatch
    get isAuthenticated() { return gmailState.isAuthenticated && isHydrated; },

    setGmailSession,
    clearGmailSession,
    setWalletSession,
    restoreGmailSession
};
