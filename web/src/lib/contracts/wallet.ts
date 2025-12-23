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
    createConnector,
    http,
    connect,
    disconnect,
    getAccount,
    watchAccount,
    type Config
} from '@wagmi/core';
import { mainnet, sepolia } from 'viem/chains';
import type { Address } from 'viem';
import type { WalletConnection, WalletAccount } from '../types';

// ============================================================================
// Wagmi Configuration
// ============================================================================

/**
 * Minimal injected wallet connector for Wagmi v3
 * Implements only essential methods, production version will use @wagmi/connectors
 */
function injected() {
    return createConnector((config) => ({
        id: 'injected',
        name: 'Browser Wallet',
        type: 'injected' as const,

        async connect(params?: any) {
            const provider = (await this.getProvider()) as any;
            const accounts = (await provider.request({
                method: 'eth_requestAccounts',
            })) as Address[];
            const chainId = await this.getChainId();
            return { accounts, chainId } as any;
        },

        async disconnect() {
            // Injected wallets typically don't support programmatic disconnect
        },

        async getAccounts() {
            const provider = (await this.getProvider()) as any;
            const accounts = (await provider.request({
                method: 'eth_accounts',
            })) as Address[];
            return accounts;
        },

        async getChainId() {
            const provider = (await this.getProvider()) as any;
            const chainId = await provider.request({
                method: 'eth_chainId',
            });
            return parseInt(chainId as string, 16);
        },

        async getProvider() {
            if (typeof window !== 'undefined' && window.ethereum) {
                return window.ethereum;
            }
            throw new Error('No injected wallet found');
        },

        async isAuthorized() {
            try {
                const accounts = await this.getAccounts();
                return accounts.length > 0;
            } catch {
                return false;
            }
        },

        onAccountsChanged(accounts: string[]) {
            if (accounts.length === 0) {
                config.emitter.emit('disconnect');
            } else {
                config.emitter.emit('change', { accounts: accounts as Address[] });
            }
        },

        onChainChanged(chain: string) {
            const chainId = parseInt(chain, 16);
            config.emitter.emit('change', { chainId });
        },

        onDisconnect() {
            config.emitter.emit('disconnect');
        },

        async setup() {
            try {
                const provider = (await this.getProvider()) as any;
                provider.on?.('accountsChanged', this.onAccountsChanged.bind(this));
                provider.on?.('chainChanged', this.onChainChanged.bind(this));
                provider.on?.('disconnect', this.onDisconnect.bind(this));
            } catch {
                // Provider not available, skip setup
            }
        },
    }));
}

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

    // Validate address format
    if (!address.startsWith('0x') || address.length !== 42) {
        console.warn(`Invalid address format: ${address}`);
        return address;
    }

    return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
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
