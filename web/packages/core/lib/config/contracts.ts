/**
 * Contract Configuration
 * 
 * Centralized configuration for deployed contract addresses.
 * Supports multiple networks (Sepolia, Mainnet).
 * 
 * @module config/contracts
 */

// SSR-safe browser check (framework-agnostic)
const browser = typeof window !== 'undefined';

// ============ Chain IDs ============

export const CHAIN_IDS = {
    SEPOLIA: 11155111,
    MAINNET: 1
} as const;

// ============ Factory Addresses ============

/**
 * Get the Factory address from environment variables
 * Falls back based on current network context
 */
function getFactoryAddress(): string | undefined {
    if (!browser) return undefined;

    // Try Sepolia first (most common for testing)
    const sepoliaAddress = import.meta.env.VITE_FACTORY_ADDRESS_SEPOLIA;
    if (sepoliaAddress) return sepoliaAddress;

    // Fallback to Mainnet
    const mainnetAddress = import.meta.env.VITE_FACTORY_ADDRESS_MAINNET;
    if (mainnetAddress) return mainnetAddress;

    console.warn('[ContractConfig] No Factory address configured in environment');
    return undefined;
}

/**
 * Factory contract address for the current environment
 */
export const FACTORY_ADDRESS = getFactoryAddress();

/**
 * Get Factory address for a specific chain
 */
export function getFactoryAddressForChain(chainId: number): string | undefined {
    switch (chainId) {
        case CHAIN_IDS.SEPOLIA:
            return import.meta.env.VITE_FACTORY_ADDRESS_SEPOLIA || '0xf2fb07b180c5de4c3a73d63d39404092b6727aae';
        case CHAIN_IDS.MAINNET:
            return import.meta.env.VITE_FACTORY_ADDRESS_MAINNET;
        default:
            console.warn(`[ContractConfig] No Factory address for chain ${chainId}`);
            return undefined;
    }
}

// ============ Other Contract Addresses ============

export const CONTRACT_ADDRESSES = {
    // JWK Registry (for ZK proof verification)
    JWK_REGISTRY: import.meta.env.VITE_JWK_REGISTRY_ADDRESS as string | undefined,

    // Verifier (Honk/Mock)
    VERIFIER: import.meta.env.VITE_VERIFIER_ADDRESS as string | undefined
} as const;
