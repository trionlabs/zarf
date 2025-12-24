/**
 * Wallet Store - Wallet Connection State
 * 
 * Manages wallet connection status, address, and chain ID.
 * Session-based (no persistence) - wallet state is ephemeral.
 * 
 * Integrates with utilities in `lib/contracts/wallet.ts`.
 * 
 * @module stores/walletStore
 */

import type { WalletState } from './types';
import type { Address } from 'viem';

// ============================================================================
// Initial State
// ============================================================================

const initialState: WalletState = {
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: null
};

// ============================================================================
// Internal State (Private)
// ============================================================================

let state = $state<WalletState>(structuredClone(initialState));

// ============================================================================
// Derived Values (Computed)
// ============================================================================

/**
 * Check if connected to wrong network
 * Expected: Sepolia (11155111) or Mainnet (1)
 */
const isWrongNetwork = $derived(
    state.isConnected &&
    state.chainId !== null &&
    state.chainId !== 1 && // Mainnet
    state.chainId !== 11155111 // Sepolia
);

const networkName = $derived(
    state.chainId === 1 ? 'Ethereum Mainnet' :
        state.chainId === 11155111 ? 'Sepolia Testnet' :
            state.chainId ? `Chain ${state.chainId}` :
                'Unknown'
);

const shortAddress = $derived(
    state.address
        ? `${state.address.slice(0, 6)}...${state.address.slice(-4)}`
        : null
);

// ============================================================================
// Mutation Actions
// ============================================================================

function setConnecting(value: boolean) {
    state.isConnecting = value;
}

function setConnected(address: Address, chainId: number) {
    state.address = address;
    state.isConnected = true;
    state.isConnecting = false;
    state.chainId = chainId;
}

function setDisconnected() {
    state = structuredClone(initialState);
}

function updateChainId(chainId: number) {
    state.chainId = chainId;
}

function updateAddress(address: Address) {
    state.address = address;
}

function reset() {
    state = structuredClone(initialState);
}

// ============================================================================
// Public API
// ============================================================================

export const walletStore = {
    // Getters (read-only)
    get address() { return state.address; },
    get isConnected() { return state.isConnected; },
    get isConnecting() { return state.isConnecting; },
    get chainId() { return state.chainId; },

    // Derived getters
    get isWrongNetwork() { return isWrongNetwork; },
    get networkName() { return networkName; },
    get shortAddress() { return shortAddress; },

    // Mutation methods
    setConnecting,
    setConnected,
    setDisconnected,
    updateChainId,
    updateAddress,
    reset
};
