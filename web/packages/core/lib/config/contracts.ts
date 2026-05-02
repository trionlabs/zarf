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

export function getActiveChainId(chainId?: number): number {
    if (chainId !== undefined) return chainId;

    const cfg = getCoreConfig();
    if (cfg.activeChainId !== undefined) return cfg.activeChainId;

    const configuredFactoryChains = Object.entries(cfg.factoryAddresses)
        .filter(([, address]) => Boolean(address))
        .map(([id]) => Number(id));

    if (configuredFactoryChains.length === 1) {
        return configuredFactoryChains[0];
    }

    throw new Error(
        'core: activeChainId is required when factory addresses are missing or configured for multiple chains',
    );
}

/**
 * Factory address for a specific chain id.
 */
export function getFactoryAddress(chainId: number): Address | undefined {
    return getCoreConfig().factoryAddresses[chainId];
}

export const getFactoryAddressForChain = getFactoryAddress;

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
