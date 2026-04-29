/**
 * Contract Configuration
 *
 * Centralized configuration for deployed contract addresses across networks.
 * Reads come through `getCoreConfig()` so this module is free of
 * `import.meta.env` and works in any runtime (browser, Node tests, server-side).
 *
 * @module config/contracts
 */

import type { Address } from 'viem';
import { getCoreConfig } from './runtime';

// ============ Chain IDs ============

export const CHAIN_IDS = {
    SEPOLIA: 11155111,
    MAINNET: 1
} as const;

// ============ Factory Addresses ============

/**
 * Factory address for the active chain (Sepolia preferred, Mainnet fallback).
 * Returns undefined if neither has been configured.
 */
export function getFactoryAddress(): Address | undefined {
    const { factoryAddresses } = getCoreConfig();
    return (
        factoryAddresses[CHAIN_IDS.SEPOLIA] ??
        factoryAddresses[CHAIN_IDS.MAINNET]
    );
}

/**
 * Factory address for a specific chain id.
 */
export function getFactoryAddressForChain(chainId: number): Address | undefined {
    return getCoreConfig().factoryAddresses[chainId];
}

// ============ Other Contract Addresses ============

/**
 * Lazy accessor for ancillary contract addresses. Returns a fresh object on
 * each call so consumers always observe the latest configured values.
 */
export function getContractAddresses(): {
    JWK_REGISTRY: Address | undefined;
    VERIFIER: Address | undefined;
} {
    const cfg = getCoreConfig();
    return {
        JWK_REGISTRY: cfg.jwkRegistryAddress,
        VERIFIER: cfg.verifierAddress,
    };
}
