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
    getNativeBalance as stellarGetBalance,
    getWalletAccount,
    watchWalletAccount,
    formatAddress,
    formatXlmAmount,
    isSupportedNetwork,
    isMainnetPassphrase,
    networkLabelFromPassphrase,
    getConfiguredNetworkName,
} from '@zarf/core/contracts/wallet';
import type { StellarBalance } from '@zarf/core/contracts/wallet';
import { getAccountExplorerUrl } from '@zarf/core/contracts/explorer';
import { warn, err } from '@zarf/core/utils/log';
import type { StellarAddress, WalletAccount } from '@zarf/core/types';
import { sanitizeBlockchainError } from '../utils/errorSanitizer';
import { networkStore } from './networkStore.svelte';

interface WalletState {
    address: StellarAddress | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    isReconnecting: boolean;
    network: string | null;
    networkPassphrase: string | null;
    balance: StellarBalance | null;
    balanceError: boolean;
    error: string | null;
    isModalOpen: boolean;
}

const initialState: WalletState = {
    address: null,
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    isReconnecting: false,
    network: null,
    networkPassphrase: null,
    balance: null,
    balanceError: false,
    error: null,
    isModalOpen: false,
};

// Module-level runes are intentionally a single app-wide store. This is safe
// under SSR: every mutator is `browser`-guarded, so writes only ever run in the
// browser. The server never populates per-request state here, so nothing can
// leak across requests — each server render sees the pristine initialState.
const state = $state<WalletState>(structuredClone(initialState));
let unwatchFn: (() => void) | null = null;
let isInitialized = false;

// Derived Values
const activeNetworkId = $derived(networkStore.activeId);
const configuredNetworkName = $derived(networkStore.active?.label ?? getConfiguredNetworkName());
const isWrongNetwork = $derived(
    Boolean(
        activeNetworkId &&
        state.isConnected &&
        !isSupportedNetwork(state.networkPassphrase ?? undefined),
    ),
);
// Trust the passphrase, not the wallet's self-reported network string: a custom
// Freighter network could carry the Public passphrase but a name like "Testnet".
const networkName = $derived(
    networkLabelFromPassphrase(state.networkPassphrase) ?? configuredNetworkName,
);
const isMainnet = $derived(isMainnetPassphrase(state.networkPassphrase));
const shortAddress = $derived(state.address ? formatAddress(state.address) : null);
// Exact bigint formatting (truncated, dust-aware) — never via float.
const formattedBalance = $derived(
    state.balance ? `${formatXlmAmount(state.balance.value)} ${state.balance.symbol}` : null,
);
const spendableBalance = $derived(
    state.balance ? `${formatXlmAmount(state.balance.spendable)} ${state.balance.symbol}` : null,
);
const hasReserve = $derived(!!state.balance && state.balance.reserved > 0n);

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
    state.error = null; // Clear old errors on state change

    // Auto-close modal if connected
    if (state.isConnected) {
        state.isModalOpen = false;
    }

    // Balance Fetch Logic
    if (state.isConnected && state.address) {
        // Refetch when the account/network changed, or when we have no balance
        // yet AND no prior failure. The `!balanceError` guard stops the 1s wallet
        // watcher from hammering Horizon when a fetch keeps failing — recovery
        // happens through the explicit retry affordance instead.
        const balanceMissing = !state.balance && !state.balanceError;
        if (
            state.address !== prevAddress ||
            state.networkPassphrase !== prevNetworkPassphrase ||
            balanceMissing
        ) {
            refreshBalance();
        }
    } else {
        state.balance = null;
        state.balanceError = false;
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
    // Reconnect failure is expected on first visit / cleared session;
    // swallow and proceed with a disconnected initial state.
    try {
        await stellarReconnect();
    } catch {
        /* no-op */
    } finally {
        state.isReconnecting = false;
    }
    if (!isInitialized) return; // destroy() ran during reconnect

    // 2. Initial Sync
    syncFromWallet();

    // 3. Setup Watcher
    if (unwatchFn) unwatchFn();
    const unwatch = await watchWalletAccount((account: WalletAccount) => {
        updateInternalState({ ...account, address: account.address ?? undefined });
    });
    if (!isInitialized) {
        // destroy() ran during the dynamic import — stop the orphan watcher
        unwatch();
        return;
    }
    unwatchFn = unwatch;
}

/**
 * Smart Connection Request.
 * Decides whether to auto-connect or open the selection modal.
 * Call this from UI components instead of connect().
 */
async function requestConnection() {
    try {
        await connect();
    } catch {
        state.isModalOpen = true;
    }
}

function closeModal() {
    state.isModalOpen = false;
    state.error = null; // Clear lingering errors
}

async function refreshBalance() {
    if (!state.address || !state.isConnected) return;
    // On a mismatched network the configured-network balance would be
    // misleading; the UI shows a "switch network" hint instead of a number.
    if (isWrongNetwork) {
        state.balance = null;
        state.balanceError = false;
        return;
    }
    state.balanceError = false;
    try {
        state.balance = await stellarGetBalance(state.address);
    } catch (e) {
        state.balanceError = true;
        warn('Failed to fetch wallet balance', e);
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
    } catch (cause: unknown) {
        err('Wallet connection failed', cause);
        state.error = sanitizeError(cause);
        throw cause;
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
    } catch (cause: unknown) {
        warn('Wallet disconnect failed', cause);
        state.error = sanitizeError(cause);
    } finally {
        state.isDisconnecting = false;
    }
}

function clearError() {
    state.error = null;
}

/**
 * Open the connect modal for a deliberate (re)connection. Freighter exposes no
 * programmatic account picker, so "change account" means: disconnect, switch
 * accounts inside Freighter, then reconnect through this modal.
 */
function openModal() {
    state.error = null;
    state.isModalOpen = true;
}

function destroy() {
    if (unwatchFn) {
        unwatchFn();
        unwatchFn = null;
    }
    isInitialized = false;
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
    get network() {
        return state.network;
    },
    get networkPassphrase() {
        return state.networkPassphrase;
    },
    get balance() {
        return state.balance;
    },
    get balanceError() {
        return state.balanceError;
    },
    get error() {
        return state.error;
    },
    get isModalOpen() {
        return state.isModalOpen;
    },

    // Derived getters
    get isWrongNetwork() {
        return isWrongNetwork;
    },
    get networkName() {
        return networkName;
    },
    get isMainnet() {
        return isMainnet;
    },
    get shortAddress() {
        return shortAddress;
    },
    get formattedBalance() {
        return formattedBalance;
    },
    get spendableBalance() {
        return spendableBalance;
    },
    get hasReserve() {
        return hasReserve;
    },
    get accountExplorerUrl() {
        if (!state.address) return null;
        try {
            return getAccountExplorerUrl(state.address);
        } catch {
            return null;
        }
    },

    // Actions
    init,
    requestConnection,
    connect,
    disconnect,
    refreshBalance,
    clearError,
    openModal,
    closeModal,
    destroy,
};

export { formatAddress, isSupportedNetwork, getConfiguredNetworkName };
