/**
 * Wallet Store - Svelte 5 Runes + Wagmi/Viem Integration
 * 
 * Single source of truth for wallet connection state.
 * Supports ETH Balance Fetching and Multi-Connector management.
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
    getWalletConnectors,
    getWalletAccount,
    watchWalletAccount,
    formatAddress,
    isSupportedChain,
    getChainName,
    wagmiConfig,
    SEPOLIA_CHAIN_ID,
    MAINNET_CHAIN_ID
} from '$lib/contracts/wallet';
import type { Address } from 'viem';
import type { Connector } from '@wagmi/core';

// Types unchanged
interface WalletBalance { value: bigint; formatted: string; symbol: string; }

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
    connectors: readonly Connector[];
    isModalOpen: boolean; // Added
}

const initialState: WalletState = {
    address: null,
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    isReconnecting: false,
    isSwitchingNetwork: false,
    chainId: null,
    balance: null,
    error: null,
    connectors: [],
    isModalOpen: false // Added
};

let state = $state<WalletState>(structuredClone(initialState));
let unwatchFn: (() => void) | null = null;
let isInitialized = false;

// Derived Values
const isWrongNetwork = $derived(state.isConnected && state.chainId !== null && !isSupportedChain(state.chainId));
const networkName = $derived(state.chainId ? getChainName(state.chainId) : 'Unknown');
const shortAddress = $derived(state.address ? formatAddress(state.address) : null);
const isLoading = $derived(state.isConnecting || state.isDisconnecting || state.isReconnecting || state.isSwitchingNetwork);
const formattedBalance = $derived(state.balance ? `${parseFloat(state.balance.formatted).toFixed(4)} ${state.balance.symbol}` : null);

// Private Helpers

/**
 * Centralized state updater to prevent logic duplication.
 * Updates core state, connector list, and triggers balance fetch if needed.
 */
function updateInternalState(account: { address?: Address, isConnected: boolean, chainId?: number }) {
    if (!browser) return;

    const prevAddress = state.address;
    const prevChainId = state.chainId;

    state.address = account.address ?? null;
    state.isConnected = account.isConnected;
    state.chainId = account.chainId ?? null;
    state.connectors = getWalletConnectors(); // Always refresh connectors

    // Reset transient loading flags
    state.isConnecting = false;
    state.isDisconnecting = false;
    state.isSwitchingNetwork = false;
    state.error = null; // Clear old errors on state change

    // Auto-close modal if connected
    if (state.isConnected) {
        state.isModalOpen = false;
    }

    // Balance Fetch Logic
    if (state.isConnected && state.address) {
        // Fetch if address/chain changed or valid connected state exists
        if (state.address !== prevAddress || state.chainId !== prevChainId || !state.balance) {
            refreshBalance();
        }
    } else {
        state.balance = null;
    }
}

function syncFromWagmi() {
    if (!browser) return;
    const account = getWalletAccount();
    updateInternalState({ ...account, address: account.address ?? undefined });
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

// Actions
async function init() {
    if (!browser) return;
    if (isInitialized) return;
    isInitialized = true;
    state.isReconnecting = true;

    // 1. Attempt Auto-Reconnect
    try { await wagmiReconnect(); } catch (e) { } finally { state.isReconnecting = false; }

    // 2. Initial Sync
    syncFromWagmi();

    // 3. Setup Watcher
    if (unwatchFn) unwatchFn();
    unwatchFn = watchWalletAccount((account) => {
        updateInternalState({ ...account, address: account.address ?? undefined });
    });
}

/**
 * Smart Connection Request.
 * Decides whether to auto-connect or open the selection modal.
 * Call this from UI components instead of connect().
 */
async function requestConnection() {
    state.connectors = getWalletConnectors(); // Refresh list first

    if (state.connectors.length > 1) {
        state.isModalOpen = true; // Multiple wallets -> Show Modal
    } else if (state.connectors.length === 1) {
        try {
            await connect(state.connectors[0]); // Single wallet -> Auto Connect
        } catch (e) {
            // Error already set in state.error by connect()
        }
    } else {
        // No wallet detected
        state.error = "No wallet detected. Please install MetaMask.";
        // Optionally show modal anyway to guide user
        state.isModalOpen = true;
    }
}

function closeModal() {
    state.isModalOpen = false;
    state.error = null; // Clear lingering errors
}

async function refreshBalance() {
    if (!state.address || !state.isConnected) return;
    try {
        const bal = await wagmiGetBalance(state.address, state.chainId ?? undefined);
        state.balance = bal;
    } catch (e) {
        if (import.meta.env.DEV) console.warn('Failed to fetch balance', e);
    }
}

async function connect(connector?: Connector) {
    if (!browser) return;
    if (state.isReconnecting) { state.error = 'Please wait, restoring previous session...'; return; }

    // Close modal if open
    state.isModalOpen = false;

    state.isConnecting = true;
    state.error = null;
    try {
        const result = await wagmiConnect(connector);
        // State update will be handled by watcher, but we can optimistically set it or wait.
        // Wagmi watcher usually fires immediately.
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
        // State update handled by watcher
    } catch (err: any) { state.error = sanitizeError(err); } finally { state.isDisconnecting = false; }
}

async function switchChain(chainId: number) {
    if (!browser) return;
    state.isSwitchingNetwork = true;
    state.error = null;
    try {
        await wagmiSwitchChain(chainId);
        // State update handled by watcher
    } catch (err: any) { state.error = sanitizeError(err); } finally { state.isSwitchingNetwork = false; }
}

function clearError() { state.error = null; }

function destroy() {
    if (unwatchFn) { unwatchFn(); unwatchFn = null; }
    isInitialized = false;
}

function setError(message: string) { state.error = message; }

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
    get connectors() { return state.connectors; },
    get isModalOpen() { return state.isModalOpen; }, // Exposed

    // Derived getters
    get isWrongNetwork() { return isWrongNetwork; },
    get networkName() { return networkName; },
    get shortAddress() { return shortAddress; },
    get formattedBalance() { return formattedBalance; },
    get isLoading() { return isLoading; },

    // Actions
    init,
    requestConnection, // Main entry point
    connect,
    disconnect,
    switchChain,
    refreshBalance,
    clearError,
    setError, // Added
    closeModal, // Exposed
    destroy
};

export {
    formatAddress,
    isSupportedChain,
    getChainName,
    wagmiConfig,
    MAINNET_CHAIN_ID,
    SEPOLIA_CHAIN_ID
};
