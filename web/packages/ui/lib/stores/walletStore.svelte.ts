/**
 * Wallet Store - Svelte 5 Runes + Stellar/Freighter Integration
 *
 * Single source of truth for wallet connection state.
 * Supports Freighter connection, network validation, and XLM balance display.
 *
 * @module stores/walletStore
 */

import { browser } from '$app/environment';
import {
    connectWallet as stellarConnect,
    disconnectWallet as stellarDisconnect,
    reconnectWallet as stellarReconnect,
    switchChain as stellarSwitchChain,
    getNativeBalance as stellarGetBalance,
    getWalletAccount,
    watchWalletAccount,
    formatAddress,
    isSupportedNetwork,
    getConfiguredNetworkName,
} from '@zarf/core/contracts/wallet';
import { getAccountExplorerUrl } from '@zarf/core/contracts';
import type { StellarAddress, WalletAccount } from '@zarf/core/types';
import { sanitizeBlockchainError } from '../utils/errorSanitizer';
import { networkStore } from './networkStore.svelte';

interface WalletBalance {
    value: bigint;
    formatted: string;
    symbol: string;
}

interface WalletState {
    address: StellarAddress | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    isReconnecting: boolean;
    isSwitchingNetwork: boolean;
    network: string | null;
    networkPassphrase: string | null;
    balance: WalletBalance | null;
    error: string | null;
    isModalOpen: boolean; // Added
}

const initialState: WalletState = {
    address: null,
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    isReconnecting: false,
    isSwitchingNetwork: false,
    network: null,
    networkPassphrase: null,
    balance: null,
    error: null,
    isModalOpen: false, // Added
};

let state = $state<WalletState>(structuredClone(initialState));
let unwatchFn: (() => void) | null = null;
let isInitialized = false;

// Derived Values
const activeNetworkId = $derived(networkStore.activeId);
const configuredNetworkName = $derived(networkStore.active?.label ?? getConfiguredNetworkName());
const isWrongNetwork = $derived(
    activeNetworkId &&
        state.isConnected &&
        !isSupportedNetwork(state.networkPassphrase ?? undefined),
);
const networkName = $derived(state.network || configuredNetworkName);
const shortAddress = $derived(state.address ? formatAddress(state.address) : null);
const isLoading = $derived(
    state.isConnecting || state.isDisconnecting || state.isReconnecting || state.isSwitchingNetwork,
);
const formattedBalance = $derived(
    state.balance
        ? `${parseFloat(state.balance.formatted).toFixed(4)} ${state.balance.symbol}`
        : null,
);

// Private Helpers

/**
 * Centralized state updater to prevent logic duplication.
 * Updates core state, connector list, and triggers balance fetch if needed.
 */
function updateInternalState(account: WalletAccount) {
    if (!browser) return;

    const prevAddress = state.address;
    const prevNetworkPassphrase = state.networkPassphrase;

    state.address = account.address ?? null;
    state.isConnected = account.isConnected;
    state.network = account.network ?? null;
    state.networkPassphrase = account.networkPassphrase ?? null;

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
        if (
            state.address !== prevAddress ||
            state.networkPassphrase !== prevNetworkPassphrase ||
            !state.balance
        ) {
            refreshBalance();
        }
    } else {
        state.balance = null;
    }
}

function syncFromWallet() {
    if (!browser) return;
    getWalletAccount()
        .then(updateInternalState)
        .catch(() => updateInternalState({ isConnected: false }));
}

function sanitizeError(err: unknown): string {
    return sanitizeBlockchainError(err, {
        customRules: [
            {
                match: /No wallet|No Stellar wallet|Freighter/i,
                message: 'No Stellar wallet detected. Please install Freighter.',
            },
            {
                match: 'already pending',
                message: 'A connection request is already pending. Check your wallet.',
            },
            {
                match: 'Network changes',
                message: 'Switch to the configured Stellar network in Freighter.',
            },
        ],
    });
}

// Actions
async function init() {
    if (!browser) return;
    if (isInitialized) return;
    isInitialized = true;
    state.isReconnecting = true;

    // 1. Attempt Auto-Reconnect
    try {
        await stellarReconnect();
    } catch (e) {
    } finally {
        state.isReconnecting = false;
    }

    // 2. Initial Sync
    syncFromWallet();

    // 3. Setup Watcher
    if (unwatchFn) unwatchFn();
    unwatchFn = watchWalletAccount((account: WalletAccount) => {
        updateInternalState({ ...account, address: account.address ?? undefined });
    });
}

/**
 * Smart Connection Request.
 * Decides whether to auto-connect or open the selection modal.
 * Call this from UI components instead of connect().
 */
async function requestConnection() {
    try {
        await connect();
    } catch (e) {
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
        const bal = await stellarGetBalance(state.address);
        state.balance = bal;
    } catch (e) {
        if ((import.meta as any).env.DEV) console.warn('Failed to fetch balance', e);
    }
}

async function connect() {
    if (!browser) return;
    if (state.isReconnecting) {
        state.error = 'Please wait, restoring previous session...';
        return;
    }

    // Close modal if open
    state.isModalOpen = false;

    state.isConnecting = true;
    state.error = null;
    try {
        const result = await stellarConnect();
        updateInternalState({
            isConnected: true,
            address: result.address,
            network: result.network,
            networkPassphrase: result.networkPassphrase,
        });
        return result;
    } catch (err: any) {
        // If it's already connected error, we can ignore it and just sync state
        if (err.name === 'ConnectorAlreadyConnectedError') {
            syncFromWallet();
            return;
        }
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
        await stellarDisconnect();
        updateInternalState({ isConnected: false });
        // State update handled by watcher
    } catch (err: any) {
        state.error = sanitizeError(err);
    } finally {
        state.isDisconnecting = false;
    }
}

async function switchChain() {
    if (!browser) return;
    state.isSwitchingNetwork = true;
    state.error = null;
    try {
        await stellarSwitchChain();
        // State update handled by watcher
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

function setError(message: string) {
    state.error = message;
}

export const walletStore = {
    // State getters
    get address() {
        return state.address;
    },
    get isConnected() {
        return state.isConnected;
    },
    get isConnecting() {
        return state.isConnecting;
    },
    get isDisconnecting() {
        return state.isDisconnecting;
    },
    get isSwitchingNetwork() {
        return state.isSwitchingNetwork;
    },
    get network() {
        return state.network;
    },
    get networkPassphrase() {
        return state.networkPassphrase;
    },
    get balance() {
        return state.balance;
    },
    get error() {
        return state.error;
    },
    get isModalOpen() {
        return state.isModalOpen;
    }, // Exposed

    // Derived getters
    get isWrongNetwork() {
        return isWrongNetwork;
    },
    get networkName() {
        return networkName;
    },
    get shortAddress() {
        return shortAddress;
    },
    get formattedBalance() {
        return formattedBalance;
    },
    get accountExplorerUrl() {
        if (!state.address) return null;
        try {
            return getAccountExplorerUrl(state.address);
        } catch {
            return null;
        }
    },
    get isLoading() {
        return isLoading;
    },

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
    destroy,
};

export { formatAddress, isSupportedNetwork, getConfiguredNetworkName };
