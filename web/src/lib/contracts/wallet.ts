/**
 * Wallet Connection Utilities using Wagmi
 * 
 * Provides a typed wrapper around Wagmi core for wallet interactions.
 * Supports MetaMask and other injected wallets.
 * 
 * @module contracts/wallet
 */

import {
    createConfig,
    http,
    connect,
    disconnect,
    reconnect,
    getAccount,
    watchAccount,
    type Config
} from '@wagmi/core';
import { mainnet, sepolia } from 'viem/chains';
import { getAddress, type Address } from 'viem';
import { injected } from '@wagmi/connectors';
import type { WalletConnection, WalletAccount } from '../types';

// ============================================================================
// Wagmi Configuration
// ============================================================================

/**
 * Wagmi configuration instance.
 * Supports Mainnet and Sepolia with HTTP transports.
 */
export const wagmiConfig: Config = createConfig({
    chains: [mainnet, sepolia],
    connectors: [injected()],
    transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
    },
});

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Connect wallet using injected connector (MetaMask, Brave, etc.).
 * 
 * @returns Promise resolving to wallet address and chain ID
 * 
 * @throws {Error} If no injected wallet is available
 * @throws {Error} If user rejects connection
 * 
 * @example
 * ```typescript
 * try {
 *   const { address, chainId } = await connectWallet();
 *   console.log(`Connected to ${address} on chain ${chainId}`);
 * } catch (error) {
 *   if (error.message.includes('rejected')) {
 *     console.log('User rejected connection');
 *   }
 * }
 * ```
 */
export async function connectWallet(): Promise<WalletConnection> {
    try {
        const result = await connect(wagmiConfig, {
            connector: injected(),
        });

        // Ensure we got an account
        if (!result.accounts || result.accounts.length === 0) {
            throw new Error('No accounts returned from wallet');
        }

        return {
            address: result.accounts[0],
            chainId: result.chainId,
        };
    } catch (error) {
        // Re-throw with clearer error messages
        if (error instanceof Error) {
            if (error.message.includes('User rejected')) {
                throw new Error('User rejected wallet connection');
            }
            if (error.message.includes('No injected provider')) {
                throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
            }
        }
        throw error;
    }
}

/**
 * Disconnect the currently connected wallet.
 * 
 * @example
 * ```typescript
 * await disconnectWallet();
 * console.log('Wallet disconnected');
 * ```
 */
export async function disconnectWallet(): Promise<void> {
    await disconnect(wagmiConfig);
}

/**
 * Attempt to reconnect to a previously connected wallet.
 * Useful for restoring session on page load.
 * 
 * @example
 * ```typescript
 * // On application startup
 * onMount(() => {
 *   reconnectWallet();
 * });
 * ```
 */
export async function reconnectWallet(): Promise<void> {
    await reconnect(wagmiConfig);
}

// ============================================================================
// Account State
// ============================================================================

/**
 * Get current wallet account information.
 * Does not trigger a connection prompt - only returns existing state.
 * 
 * @returns Current account state (connected or not)
 * 
 * @example
 * ```typescript
 * const account = getWalletAccount();
 * 
 * if (account.isConnected) {
 *   console.log(`Connected: ${account.address}`);
 * } else {
 *   console.log('No wallet connected');
 * }
 * ```
 */
export function getWalletAccount(): WalletAccount {
    const account = getAccount(wagmiConfig);

    return {
        address: account.address,
        isConnected: account.isConnected,
        chainId: account.chainId,
    };
}

/**
 * Watch for wallet account changes (connect, disconnect, switch account).
 * Useful for reactive UI updates.
 * 
 * @param callback - Function called whenever account state changes
 * @returns Unsubscribe function to stop watching
 * 
 * @example
 * ```typescript
 * // In Svelte component
 * import { onMount, onDestroy } from 'svelte';
 * 
 * let walletAddress = $state<Address | undefined>(undefined);
 * let unwatch: (() => void) | null = null;
 * 
 * onMount(() => {
 *   unwatch = watchWalletAccount((account) => {
 *     walletAddress = account.address;
 *     if (account.isConnected) {
 *       console.log('Wallet connected:', account.address);
 *     } else {
 *       console.log('Wallet disconnected');
 *     }
 *   });
 * });
 * 
 * onDestroy(() => {
 *   unwatch?.();
 * });
 * ```
 */
export function watchWalletAccount(
    callback: (account: WalletAccount) => void
): () => void {
    return watchAccount(wagmiConfig, {
        onChange: (account) => {
            callback({
                address: account.address,
                isConnected: account.isConnected,
                chainId: account.chainId,
            });
        },
    });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format Ethereum address for display.
 * Shortens to first and last N characters.
 * 
 * @param address - Full Ethereum address
 * @param chars - Number of characters to show on each end (default: 4)
 * @returns Formatted address like "0x1234...5678" or empty string if no address
 * 
 * @example
 * ```typescript
 * formatAddress('0x1234567890123456789012345678901234567890');
 * // "0x1234...7890"
 * 
 * formatAddress('0x1234567890123456789012345678901234567890', 6);
 * // "0x123456...567890"
 * 
 * formatAddress(undefined);
 * // ""
 * ```
 */


export function formatAddress(address: Address | undefined, chars: number = 4): string {
    if (!address) return '';

    try {
        // Security: Ensure address is checksummed and valid
        const checksummedAddress = getAddress(address);
        return `${checksummedAddress.slice(0, chars + 2)}...${checksummedAddress.slice(-chars)}`;
    } catch (e) {
        console.warn(`Security Warning: Invalid Ethereum address format detected: ${address}`);
        return ''; // Fail safe: Return empty string instead of invalid address
    }
}

/**
 * Check if the current chain is supported.
 * 
 * @param chainId - Chain ID to check
 * @returns True if chain is supported (Mainnet or Sepolia)
 * 
 * @example
 * ```typescript
 * const account = getWalletAccount();
 * if (account.chainId && !isSupportedChain(account.chainId)) {
 *   alert('Please switch to Mainnet or Sepolia');
 * }
 * ```
 */
export function isSupportedChain(chainId: number | undefined): boolean {
    if (!chainId) return false;
    return chainId === mainnet.id || chainId === sepolia.id;
}

/**
 * Get human-readable chain name.
 * 
 * @param chainId - Chain ID
 * @returns Chain name or "Unknown"
 * 
 * @example
 * ```typescript
 * getChainName(1);        // "Ethereum"
 * getChainName(11155111); // "Sepolia"
 * getChainName(999);      // "Unknown"
 * ```
 */
export function getChainName(chainId: number | undefined): string {
    if (!chainId) return 'Unknown';

    switch (chainId) {
        case mainnet.id:
            return 'Ethereum';
        case sepolia.id:
            return 'Sepolia';
        default:
            return 'Unknown';
    }
}
