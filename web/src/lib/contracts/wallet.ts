/**
 * Wallet Connection Utilities using Wagmi
 * 
 * Provides a typed wrapper around Wagmi core for wallet interactions.
 * Supports MetaMask and other injected wallets.
 * 
 * SSR-SAFE: All functions check for browser environment before accessing window.
 * 
 * @module contracts/wallet
 */

import { browser } from '$app/environment';
import {
    createConfig,
    http,
    connect,
    disconnect,
    reconnect,
    getAccount,
    watchAccount,
    switchChain as wagmiSwitchChainAction,
    type Config
} from '@wagmi/core';
import { mainnet, sepolia } from 'viem/chains';
import { getAddress, type Address } from 'viem';
import { injected } from '@wagmi/connectors';
import type { WalletConnection, WalletAccount } from '../types';

// ============================================================================
// Constants
// ============================================================================

export const MAINNET_CHAIN_ID = mainnet.id; // 1
export const SEPOLIA_CHAIN_ID = sepolia.id; // 11155111

// ============================================================================
// Wagmi Configuration (Lazy Initialization for SSR Safety)
// ============================================================================

let _wagmiConfig: Config | null = null;

/**
 * Get or create Wagmi configuration.
 * Lazy initialization ensures SSR safety.
 */
function getWagmiConfig(): Config {
    if (!_wagmiConfig) {
        _wagmiConfig = createConfig({
            chains: [mainnet, sepolia],
            connectors: [injected()],
            transports: {
                [mainnet.id]: http(),
                [sepolia.id]: http(),
            },
        });
    }
    return _wagmiConfig;
}

// Export for external use (e.g., viem client creation)
export const wagmiConfig = browser ? getWagmiConfig() : ({} as Config);

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Connect wallet using injected connector (MetaMask, Brave, etc.).
 * 
 * @returns Promise resolving to wallet address and chain ID
 * @throws {Error} If no injected wallet is available
 * @throws {Error} If user rejects connection
 */
export async function connectWallet(): Promise<WalletConnection> {
    if (!browser) {
        throw new Error('Cannot connect wallet during SSR');
    }

    const config = getWagmiConfig();

    try {
        const result = await connect(config, {
            connector: injected(),
        });

        if (!result.accounts || result.accounts.length === 0) {
            throw new Error('No accounts returned from wallet');
        }

        return {
            address: result.accounts[0],
            chainId: result.chainId,
        };
    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('User rejected')) {
                throw new Error('User rejected wallet connection');
            }
            if (error.message.includes('No injected provider') || error.message.includes('Connector not found')) {
                throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
            }
        }
        throw error;
    }
}

/**
 * Disconnect the currently connected wallet.
 */
export async function disconnectWallet(): Promise<void> {
    if (!browser) return;
    await disconnect(getWagmiConfig());
}

/**
 * Attempt to reconnect to a previously connected wallet.
 * Useful for restoring session on page load.
 */
export async function reconnectWallet(): Promise<void> {
    if (!browser) return;
    await reconnect(getWagmiConfig());
}

/**
 * Switch to a different chain.
 * 
 * @param chainId - Target chain ID
 */
export async function switchChain(chainId: number): Promise<void> {
    if (!browser) return;

    const config = getWagmiConfig();
    await wagmiSwitchChainAction(config, { chainId });
}

// ============================================================================
// Account State
// ============================================================================

/**
 * Get current wallet account information.
 * Does not trigger a connection prompt - only returns existing state.
 */
export function getWalletAccount(): WalletAccount {
    if (!browser) {
        return {
            address: undefined,
            isConnected: false,
            chainId: undefined,
        };
    }

    const account = getAccount(getWagmiConfig());

    return {
        address: account.address,
        isConnected: account.isConnected,
        chainId: account.chainId,
    };
}

/**
 * Watch for wallet account changes (connect, disconnect, switch account).
 * 
 * @param callback - Function called whenever account state changes
 * @returns Unsubscribe function to stop watching
 */
export function watchWalletAccount(
    callback: (account: WalletAccount) => void
): () => void {
    if (!browser) {
        return () => { }; // No-op for SSR
    }

    return watchAccount(getWagmiConfig(), {
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
 * Uses EIP-55 checksummed format for security.
 */
export function formatAddress(address: Address | undefined, chars: number = 4): string {
    if (!address) return '';

    try {
        const checksummedAddress = getAddress(address);
        return `${checksummedAddress.slice(0, chars + 2)}...${checksummedAddress.slice(-chars)}`;
    } catch (e) {
        if (import.meta.env.DEV) {
            console.warn(`Invalid Ethereum address format: ${address}`);
        }
        return '';
    }
}

/**
 * Check if the current chain is supported.
 */
export function isSupportedChain(chainId: number | undefined): boolean {
    if (!chainId) return false;
    return chainId === MAINNET_CHAIN_ID || chainId === SEPOLIA_CHAIN_ID;
}

/**
 * Get human-readable chain name.
 */
export function getChainName(chainId: number | undefined): string {
    if (!chainId) return 'Unknown';

    switch (chainId) {
        case MAINNET_CHAIN_ID:
            return 'Ethereum';
        case SEPOLIA_CHAIN_ID:
            return 'Sepolia';
        default:
            return 'Unknown';
    }
}
