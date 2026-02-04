/**
 * Lazy Wallet Connection
 *
 * This module provides lazy-loaded wallet functionality to prevent
 * SES lockdown from running before Svelte initializes.
 *
 * IMPORTANT: Do NOT import this at module level. Use dynamic imports:
 * ```ts
 * const { connectWallet } = await import('@zarf/core/contracts/walletLazy');
 * ```
 *
 * @module contracts/walletLazy
 */

import type { Config, Connector } from '@wagmi/core';
import type { Address } from 'viem';
import type { WalletConnection, WalletAccount } from '../types';

// Lazy-loaded module references
let wagmiCore: typeof import('@wagmi/core') | null = null;
let wagmiConnectors: typeof import('@wagmi/connectors') | null = null;
let viemChains: typeof import('viem/chains') | null = null;
let viemCore: typeof import('viem') | null = null;

let _wagmiConfig: Config | null = null;
let _initPromise: Promise<Config> | null = null;

const browser = typeof window !== 'undefined';

/**
 * Lazily initialize wagmi - only loads the heavy wallet code when first called
 */
async function initWagmi(): Promise<Config> {
    if (_wagmiConfig) return _wagmiConfig;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        // Dynamic imports - these won't execute until this function is called
        const [core, connectors, chains, viem] = await Promise.all([
            import('@wagmi/core'),
            import('@wagmi/connectors'),
            import('viem/chains'),
            import('viem'),
        ]);

        wagmiCore = core;
        wagmiConnectors = connectors;
        viemChains = chains;
        viemCore = viem;

        const { createConfig, http, fallback } = core;
        const { injected } = connectors;
        const { mainnet, sepolia } = chains;

        // Build RPC configuration
        const sepoliaRpcs = [
            ...(import.meta.env.VITE_SEPOLIA_RPC_URL
                ? [http(import.meta.env.VITE_SEPOLIA_RPC_URL)]
                : []),
            http('https://rpc.sepolia.org'),
            http('https://1rpc.io/sepolia'),
            http('https://ethereum-sepolia-rpc.publicnode.com'),
        ];

        const mainnetRpcs = [
            ...(import.meta.env.VITE_MAINNET_RPC_URL
                ? [http(import.meta.env.VITE_MAINNET_RPC_URL)]
                : []),
            http('https://ethereum-rpc.publicnode.com'),
            http('https://eth.llamarpc.com'),
        ];

        _wagmiConfig = createConfig({
            chains: [mainnet, sepolia],
            connectors: [injected()],
            transports: {
                [mainnet.id]: fallback(mainnetRpcs),
                [sepolia.id]: fallback(sepoliaRpcs),
            },
        });

        console.log('[Wallet Lazy] Wagmi initialized on-demand');
        return _wagmiConfig;
    })();

    return _initPromise;
}

/**
 * Get the wagmi config, initializing lazily if needed
 */
export async function getConfig(): Promise<Config> {
    if (!browser) throw new Error('Wallet operations require browser environment');
    return initWagmi();
}

/**
 * Connect to wallet - lazy loads wagmi on first call
 */
export async function connectWallet(connector?: Connector): Promise<WalletConnection> {
    if (!browser) throw new Error('Cannot connect wallet during SSR');

    const config = await initWagmi();
    const { connect, getConnectors } = wagmiCore!;

    const connectors = getConnectors(config);
    const targetConnector = connector || connectors[0];

    try {
        const result = await connect(config, { connector: targetConnector });

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
            if (error.message.includes('No injected provider')) {
                throw new Error('No wallet detected. Please install MetaMask.');
            }
        }
        throw error;
    }
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet(): Promise<void> {
    if (!browser || !_wagmiConfig) return;
    const { disconnect } = wagmiCore!;
    await disconnect(_wagmiConfig);
}

/**
 * Reconnect to previously connected wallet
 */
export async function reconnectWallet(): Promise<void> {
    if (!browser) return;
    const config = await initWagmi();
    const { reconnect } = wagmiCore!;
    await reconnect(config);
}

/**
 * Switch blockchain network
 */
export async function switchChain(chainId: number): Promise<void> {
    if (!browser || !_wagmiConfig) return;
    const { switchChain: wagmiSwitch } = wagmiCore!;
    await wagmiSwitch(_wagmiConfig, { chainId });
}

/**
 * Get current wallet account state
 */
export async function getWalletAccount(): Promise<WalletAccount> {
    if (!browser) return { address: undefined, isConnected: false, chainId: undefined };

    const config = await initWagmi();
    const { getAccount } = wagmiCore!;
    const account = getAccount(config);

    return {
        address: account.address,
        isConnected: account.isConnected,
        chainId: account.chainId,
        connector: account.connector,
    };
}

/**
 * Watch for account changes
 */
export async function watchWalletAccount(
    callback: (account: WalletAccount) => void
): Promise<() => void> {
    if (!browser) return () => {};

    const config = await initWagmi();
    const { watchAccount } = wagmiCore!;

    return watchAccount(config, {
        onChange: (account) => {
            callback({
                address: account.address,
                isConnected: account.isConnected,
                chainId: account.chainId,
                connector: account.connector,
            });
        },
    });
}

/**
 * Get native ETH balance
 */
export async function getNativeBalance(
    address: Address,
    chainId?: number
): Promise<{ value: bigint; formatted: string; symbol: string }> {
    if (!browser) return { value: 0n, formatted: '0', symbol: 'ETH' };

    const config = await initWagmi();
    const { getBalance } = wagmiCore!;
    const { formatEther } = viemCore!;

    const balance = await getBalance(config, { address, chainId });
    return {
        value: balance.value,
        formatted: formatEther(balance.value),
        symbol: balance.symbol,
    };
}

/**
 * Get available connectors (MetaMask, etc.)
 */
export async function getWalletConnectors(): Promise<readonly Connector[]> {
    if (!browser) return [];
    const config = await initWagmi();
    const { getConnectors } = wagmiCore!;
    return getConnectors(config);
}

/**
 * Check if wagmi is already initialized (useful for conditional logic)
 */
export function isWagmiInitialized(): boolean {
    return _wagmiConfig !== null;
}

// Re-export constants that don't trigger SES
export const MAINNET_CHAIN_ID = 1;
export const SEPOLIA_CHAIN_ID = 11155111;
