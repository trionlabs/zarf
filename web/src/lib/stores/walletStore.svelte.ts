/**
 * Wallet Store - Svelte 5 Runes + Wagmi/Viem Integration
 * 
 * Single source of truth for wallet connection state.
 * Supports ETH Balance Fetching.
 * 
 * @module stores/walletStore
 */

import { browser } from '$app/environment';
import {
    connectWallet as wagmiConnect,
    disconnectWallet as wagmiDisconnect,
    reconnectWallet as wagmiReconnect,
    switchChain as wagmiSwitchChain,
    getNativeBalance as wagmiGetBalance,
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

interface WalletBalance {
    value: bigint;
    formatted: string;
    symbol: string;
}

interface WalletState {
    address: Address | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    isReconnecting: boolean;
    isSwitchingNetwork: boolean;
    chainId: number | null;
    balance: WalletBalance | null;
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
    balance: null,
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

const formattedBalance = $derived(
    state.balance ? `${parseFloat(state.balance.formatted).toFixed(4)} ${state.balance.symbol}` : null
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

    // Trigger balance fetch if connected
    if (state.isConnected && state.address) {
        refreshBalance();
    } else {
        state.balance = null;
    }
}

function sanitizeError(err: any): string {
    const message = err?.message || '';
    if (message.includes('rejected') || message.includes('denied')) return 'Request rejected by user';
    if (message.includes('No wallet') || message.includes('No injected')) return 'No Ethereum wallet detected. Please install MetaMask.';
    if (message.includes('already pending')) return 'A connection request is already pending. Check your wallet.';
    if (message.includes('Chain not configured')) return 'Network switch failed. Please switch manually in your wallet.';
    if (import.meta.env.DEV) console.error('Wallet error:', err);
    return 'An unexpected error occurred';
}

// ============================================================================
// Public Actions
// ============================================================================

/**
 * Initialize wallet watcher.
 */
async function init() {
    if (!browser) return;
    if (isInitialized) return;

    isInitialized = true;
    state.isReconnecting = true;

    try {
        await wagmiReconnect();
    } catch (e) {
        // Expected
    } finally {
        state.isReconnecting = false;
    }

    syncFromWagmi();

    if (unwatchFn) unwatchFn();
    unwatchFn = watchWalletAccount((account) => {
        const prevAddress = state.address;
        const prevChainId = state.chainId;

        state.address = account.address ?? null;
        state.isConnected = account.isConnected;
        state.chainId = account.chainId ?? null;
        state.isConnecting = false;
        state.isDisconnecting = false;
        state.isSwitchingNetwork = false;
        state.error = null;

        // Fetch balance on account or chain change
        if (state.isConnected && state.address) {
            if (state.address !== prevAddress || state.chainId !== prevChainId) {
                refreshBalance();
            }
        } else {
            state.balance = null;
        }
    });
}

/**
 * Fetch latest native balance.
 */
async function refreshBalance() {
    if (!state.address || !state.isConnected) return;

    try {
        const bal = await wagmiGetBalance(state.address, state.chainId ?? undefined);
        state.balance = bal;
    } catch (e) {
        console.warn('Failed to fetch balance', e);
    }
}

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
        await refreshBalance();
        return result;
    } catch (err: any) {
        state.error = sanitizeError(err);
        throw err;
    } finally {
        state.isConnecting = false;
    }
}

async function disconnect() {
    if (!browser) return;
    state.isDisconnecting = true;
    state.error = null;
    try {
        await wagmiDisconnect();
        state.address = null;
        state.isConnected = false;
        state.chainId = null;
        state.balance = null;
    } catch (err: any) {
        state.error = sanitizeError(err);
    } finally {
        state.isDisconnecting = false;
    }
}

async function switchToSepolia() {
    if (!browser) return;
    state.isSwitchingNetwork = true;
    state.error = null;
    try {
        await wagmiSwitchChain(SEPOLIA_CHAIN_ID);
        state.chainId = SEPOLIA_CHAIN_ID;
        // Balance will be auto-fetched by watcher
    } catch (err: any) {
        state.error = sanitizeError(err);
    } finally {
        state.isSwitchingNetwork = false;
    }
}

function clearError() {
    state.error = null;
}

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
    // State getters
    get address() { return state.address; },
    get isConnected() { return state.isConnected; },
    get isConnecting() { return state.isConnecting; },
    get isDisconnecting() { return state.isDisconnecting; },
    get isSwitchingNetwork() { return state.isSwitchingNetwork; },
    get chainId() { return state.chainId; },
    get balance() { return state.balance; },
    get error() { return state.error; },

    // Derived getters
    get isWrongNetwork() { return isWrongNetwork; },
    get networkName() { return networkName; },
    get shortAddress() { return shortAddress; },
    get formattedBalance() { return formattedBalance; },
    get isLoading() { return isLoading; },

    // Actions
    init,
    connect,
    disconnect,
    switchToSepolia,
    refreshBalance,
    clearError,
    destroy
};

export { formatAddress, isSupportedChain, getChainName, wagmiConfig };
