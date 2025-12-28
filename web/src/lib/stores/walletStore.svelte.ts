/**
 * Wallet Store - Svelte 5 Runes + Wagmi/Viem Integration
 * 
 * Single source of truth for wallet connection state.
 * Uses wagmi/core for connection management, Svelte 5 Runes for reactivity.
 * 
 * Supports: MetaMask, Rainbow, Rabbit Wallet, Brave, Coinbase (all injected wallets)
 * 
 * USAGE:
 * - Call init() ONCE in root +layout.svelte (not in components)
 * - Call destroy() on root layout unmount
 * 
 * @module stores/walletStore
 */

import { browser } from '$app/environment';
import {
    connectWallet as wagmiConnect,
    disconnectWallet as wagmiDisconnect,
    reconnectWallet as wagmiReconnect,
    switchChain as wagmiSwitchChain,
    getWalletAccount,
    watchWalletAccount,
    formatAddress,
    isSupportedChain,
    getChainName,
    wagmiConfig,
    SEPOLIA_CHAIN_ID
} from '$lib/contracts/wallet';
import type { Address } from 'viem';

// ============================================================================
// Types
// ============================================================================

interface WalletState {
    address: Address | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    isReconnecting: boolean;
    isSwitchingNetwork: boolean;
    chainId: number | null;
    error: string | null;
}

// ============================================================================
// Internal State (Private)
// ============================================================================

const initialState: WalletState = {
    address: null,
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    isReconnecting: false,
    isSwitchingNetwork: false,
    chainId: null,
    error: null
};

let state = $state<WalletState>(structuredClone(initialState));
let unwatchFn: (() => void) | null = null;
let isInitialized = false;

// ============================================================================
// Derived Values (Computed)
// ============================================================================

const isWrongNetwork = $derived(
    state.isConnected &&
    state.chainId !== null &&
    !isSupportedChain(state.chainId)
);

const networkName = $derived(
    state.chainId ? getChainName(state.chainId) : 'Unknown'
);

const shortAddress = $derived(
    state.address ? formatAddress(state.address) : null
);

const isLoading = $derived(
    state.isConnecting || state.isDisconnecting || state.isReconnecting || state.isSwitchingNetwork
);

// ============================================================================
// Private Helpers
// ============================================================================

function syncFromWagmi() {
    if (!browser) return;

    const account = getWalletAccount();
    state.address = account.address ?? null;
    state.isConnected = account.isConnected;
    state.chainId = account.chainId ?? null;
}

function sanitizeError(err: any): string {
    const message = err?.message || '';

    if (message.includes('rejected') || message.includes('denied')) {
        return 'Request rejected by user';
    }
    if (message.includes('No wallet') || message.includes('No injected')) {
        return 'No Ethereum wallet detected. Please install MetaMask.';
    }
    if (message.includes('already pending')) {
        return 'A connection request is already pending. Check your wallet.';
    }
    if (message.includes('Chain not configured')) {
        return 'Network switch failed. Please switch manually in your wallet.';
    }

    // Only log unexpected errors in development
    if (import.meta.env.DEV) {
        console.error('Wallet error:', err);
    }

    return 'An unexpected error occurred';
}

// ============================================================================
// Public Actions
// ============================================================================

/**
 * Initialize wallet watcher. Call ONCE on app mount (in root layout).
 * Syncs initial state, attempts reconnect, and watches for changes.
 */
async function init() {
    if (!browser) return;
    if (isInitialized) return; // Prevent duplicate init

    isInitialized = true;
    state.isReconnecting = true;

    try {
        // 1. Attempt Auto-Reconnect
        await wagmiReconnect();
    } catch (e) {
        // Expected if no previous session - not an error
    } finally {
        state.isReconnecting = false;
    }

    // 2. Sync initial state
    syncFromWagmi();

    // 3. Watch for account changes (connect, disconnect, switch)
    if (unwatchFn) unwatchFn();
    unwatchFn = watchWalletAccount((account) => {
        state.address = account.address ?? null;
        state.isConnected = account.isConnected;
        state.chainId = account.chainId ?? null;
        state.isConnecting = false;
        state.isDisconnecting = false;
        state.isSwitchingNetwork = false;
        state.error = null;
    });
}

/**
 * Connect wallet. Triggers browser wallet popup.
 */
async function connect() {
    if (!browser) return;
    if (state.isReconnecting) {
        state.error = 'Please wait, restoring previous session...';
        return;
    }

    state.isConnecting = true;
    state.error = null;

    try {
        const result = await wagmiConnect();
        state.address = result.address;
        state.chainId = result.chainId;
        state.isConnected = true;
        return result;
    } catch (err: any) {
        state.error = sanitizeError(err);
        throw err;
    } finally {
        state.isConnecting = false;
    }
}

/**
 * Disconnect wallet.
 */
async function disconnect() {
    if (!browser) return;

    state.isDisconnecting = true;
    state.error = null;

    try {
        await wagmiDisconnect();
        // Reset state but keep isInitialized
        state.address = null;
        state.isConnected = false;
        state.chainId = null;
    } catch (err: any) {
        state.error = sanitizeError(err);
    } finally {
        state.isDisconnecting = false;
    }
}

/**
 * Switch to Sepolia network.
 */
async function switchToSepolia() {
    if (!browser) return;

    state.isSwitchingNetwork = true;
    state.error = null;

    try {
        await wagmiSwitchChain(SEPOLIA_CHAIN_ID);
        state.chainId = SEPOLIA_CHAIN_ID;
    } catch (err: any) {
        state.error = sanitizeError(err);
        throw err;
    } finally {
        state.isSwitchingNetwork = false;
    }
}

/**
 * Clear error state.
 */
function clearError() {
    state.error = null;
}

/**
 * Cleanup watcher. Call on app unmount (in root layout).
 */
function destroy() {
    if (unwatchFn) {
        unwatchFn();
        unwatchFn = null;
    }
    isInitialized = false;
}

// ============================================================================
// Public API
// ============================================================================

export const walletStore = {
    // State getters (reactive)
    get address() { return state.address; },
    get isConnected() { return state.isConnected; },
    get isConnecting() { return state.isConnecting; },
    get isDisconnecting() { return state.isDisconnecting; },
    get isSwitchingNetwork() { return state.isSwitchingNetwork; },
    get chainId() { return state.chainId; },
    get error() { return state.error; },

    // Derived getters
    get isWrongNetwork() { return isWrongNetwork; },
    get networkName() { return networkName; },
    get shortAddress() { return shortAddress; },
    get isLoading() { return isLoading; },

    // Actions
    init,
    connect,
    disconnect,
    switchToSepolia,
    clearError,
    destroy
};

// Re-export utilities
export { formatAddress, isSupportedChain, getChainName, wagmiConfig };
