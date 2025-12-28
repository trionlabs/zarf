/**
 * Wallet Store - Svelte 5 Runes + Wagmi/Viem Integration
 * 
 * Single source of truth for wallet connection state.
 * Uses wagmi/core for connection management, Svelte 5 Runes for reactivity.
 * 
 * Supports: MetaMask, Rainbow, Rabbit Wallet, Brave, Coinbase (all injected wallets)
 * 
 * @module stores/walletStore
 */

import {
    connectWallet as wagmiConnect,
    disconnectWallet as wagmiDisconnect,
    reconnectWallet as wagmiReconnect,
    getWalletAccount,
    watchWalletAccount,
    formatAddress,
    isSupportedChain,
    getChainName,
    wagmiConfig
} from '$lib/contracts/wallet';
import type { Address } from 'viem';

// ============================================================================
// Types
// ============================================================================

interface WalletState {
    address: Address | null;
    isConnected: boolean;
    isConnecting: boolean;
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
    chainId: null,
    error: null
};

let state = $state<WalletState>(structuredClone(initialState));
let unwatchFn: (() => void) | null = null;

// ============================================================================
// Derived Values (Computed)
// ============================================================================

const isWrongNetwork = $derived(
    state.isConnected &&
    state.chainId !== null &&
    !isSupportedChain(state.chainId)
);

const networkName = $derived(getChainName(state.chainId ?? undefined));

const shortAddress = $derived(
    state.address ? formatAddress(state.address) : null
);

// ============================================================================
// Private Helpers
// ============================================================================

function syncFromWagmi() {
    const account = getWalletAccount();
    state.address = account.address ?? null;
    state.isConnected = account.isConnected;
    state.chainId = account.chainId ?? null;
}

// ============================================================================
// Public Actions
// ============================================================================

/**
 * Initialize wallet watcher. Call once on app mount.
 * Syncs initial state, attempts reconnect, and watches for changes.
 */
async function init() {
    // 1. Attempt Auto-Reconnect
    try {
        await wagmiReconnect();
    } catch (e) {
        // Expected if no previous session
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
        state.error = null;
    });
}

/**
 * Connect wallet. Triggers browser wallet popup.
 */
async function connect() {
    state.isConnecting = true;
    state.error = null;

    try {
        const result = await wagmiConnect();
        state.address = result.address;
        state.chainId = result.chainId;
        state.isConnected = true;
        return result;
    } catch (err: any) {
        console.warn('Wallet connection error:', err);

        // Security: Sanitize error messages for UI
        let message = 'Failed to connect wallet';

        if (err.message && (err.message.includes('rejected') || err.message.includes('denied'))) {
            message = 'Connection request rejected by user';
        } else if (err.message && err.message.includes('No wallet')) {
            message = 'No Ethereum wallet detected. Please install MetaMask.';
        } else {
            // Log full error for devs, show generic error to user to avoid info leakage
            console.error('Unexpected wallet error:', err);
            message = 'Connection failed due to an unknown error';
        }

        state.error = message;
        throw err;
    } finally {
        state.isConnecting = false;
    }
}

/**
 * Disconnect wallet.
 */
async function disconnect() {
    try {
        await wagmiDisconnect();
        state = structuredClone(initialState);
    } catch (err: any) {
        state.error = err.message || 'Failed to disconnect';
    }
}

/**
 * Clear error state.
 */
function clearError() {
    state.error = null;
}

/**
 * Cleanup watcher. Call on app unmount.
 */
function destroy() {
    if (unwatchFn) {
        unwatchFn();
        unwatchFn = null;
    }
}

// ============================================================================
// Public API
// ============================================================================

export const walletStore = {
    // State getters (reactive)
    get address() { return state.address; },
    get isConnected() { return state.isConnected; },
    get isConnecting() { return state.isConnecting; },
    get chainId() { return state.chainId; },
    get error() { return state.error; },

    // Derived getters
    get isWrongNetwork() { return isWrongNetwork; },
    get networkName() { return networkName; },
    get shortAddress() { return shortAddress; },

    // Actions
    init,
    connect,
    disconnect,
    clearError,
    destroy
};

// Re-export utilities
export { formatAddress, isSupportedChain, getChainName, wagmiConfig };
