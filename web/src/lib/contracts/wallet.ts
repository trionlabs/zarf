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
    getBalance as wagmiGetBalance,
    getConnectors as wagmiGetConnectors,
    type Config,
    type GetBalanceReturnType,
    type Connector
} from '@wagmi/core';
import { mainnet, sepolia } from 'viem/chains';
import { getAddress, formatEther, type Address } from 'viem';
import { injected } from '@wagmi/connectors';
import type { WalletConnection, WalletAccount } from '../types';

// ... (constants and config unchanged)
// ============================================================================
// Constants
// ============================================================================
export const MAINNET_CHAIN_ID = mainnet.id;
export const SEPOLIA_CHAIN_ID = sepolia.id;

// ============================================================================
// Wagmi Configuration (Lazy Initialization for SSR Safety)
// ============================================================================

let _wagmiConfig: Config | null = null;

function getWagmiConfig(): Config {
    if (!_wagmiConfig) {
        _wagmiConfig = createConfig({
            chains: [mainnet, sepolia],
            connectors: [injected()], // EIP-6963 providers will be auto-discovered
            transports: {
                [mainnet.id]: http(),
                [sepolia.id]: http(),
            },
        });
    }
    return _wagmiConfig;
}

export const wagmiConfig = browser ? getWagmiConfig() : ({} as Config);

// ============================================================================
// Connection Management
// ============================================================================

export async function connectWallet(connector?: Connector): Promise<WalletConnection> {
    if (!browser) {
        throw new Error('Cannot connect wallet during SSR');
    }

    const config = getWagmiConfig();

    // If no specific connector provided, use the first available (default behavior)
    // Or prefer EIP-6963 connectors if available
    const connectors = wagmiGetConnectors(config);
    const targetConnector = connector || connectors[0];

    try {
        const result = await connect(config, {
            connector: targetConnector,
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

export async function disconnectWallet(): Promise<void> {
    if (!browser) return;
    await disconnect(getWagmiConfig());
}

export async function reconnectWallet(): Promise<void> {
    if (!browser) return;
    await reconnect(getWagmiConfig());
}

export async function switchChain(chainId: number): Promise<void> {
    if (!browser) return;
    const config = getWagmiConfig();
    await wagmiSwitchChainAction(config, { chainId });
}

export async function getNativeBalance(address: Address, chainId?: number): Promise<{ value: bigint, formatted: string, symbol: string }> {
    if (!browser) return { value: BigInt(0), formatted: '0', symbol: 'ETH' };
    const config = getWagmiConfig();
    const balance = await wagmiGetBalance(config, { address, chainId });
    return {
        value: balance.value,
        formatted: formatEther(balance.value),
        symbol: balance.symbol
    };
}

/**
 * Get available wallet connectors.
 * Can be used to list detected wallets (MetaMask, Phantom, etc.)
 */
export function getWalletConnectors(): readonly Connector[] {
    if (!browser) return [];
    return wagmiGetConnectors(getWagmiConfig());
}

// ... (Account State and Utils unchanged)
export function getWalletAccount(): WalletAccount {
    if (!browser) return { address: undefined, isConnected: false, chainId: undefined };
    const account = getAccount(getWagmiConfig());
    return { address: account.address, isConnected: account.isConnected, chainId: account.chainId };
}

export function watchWalletAccount(callback: (account: WalletAccount) => void): () => void {
    if (!browser) return () => { };
    return watchAccount(getWagmiConfig(), {
        onChange: (account) => {
            callback({ address: account.address, isConnected: account.isConnected, chainId: account.chainId });
        },
    });
}

export function formatAddress(address: Address | undefined, chars: number = 4): string {
    if (!address) return '';
    try {
        const checksummedAddress = getAddress(address);
        return `${checksummedAddress.slice(0, chars + 2)}...${checksummedAddress.slice(-chars)}`;
    } catch (e) {
        if (import.meta.env.DEV) console.warn(`Invalid Ethereum address format: ${address}`);
        return '';
    }
}

export function isSupportedChain(chainId: number | undefined): boolean {
    if (!chainId) return false;
    return chainId === MAINNET_CHAIN_ID || chainId === SEPOLIA_CHAIN_ID;
}

export function getChainName(chainId: number | undefined): string {
    if (!chainId) return 'Unknown';
    switch (chainId) {
        case MAINNET_CHAIN_ID: return 'Ethereum';
        case SEPOLIA_CHAIN_ID: return 'Sepolia';
        default: return 'Unknown';
    }
}
