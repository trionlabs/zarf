/**
 * Contract Configuration
 *
 * Centralized configuration for deployed contract addresses across networks.
 * Reads come through `getCoreConfig()` so this module is free of
 * `import.meta.env` and works in any runtime (browser, Node tests, server-side).
 *
 * @module config/contracts
 */

import type { StellarContractId } from '../types';
import { getStellarConfig } from './runtime';

/**
 * Factory address for the configured Stellar deployment.
 */
export function getFactoryAddress(): StellarContractId | undefined {
    return getStellarConfig().factoryAddress;
}

export const getFactoryAddressForChain = getFactoryAddress;

// ============ Other Contract Addresses ============

/**
 * Lazy accessor for ancillary contract addresses. Returns a fresh object on
 * each call so consumers always observe the latest configured values.
 */
export function getContractAddresses(): {
    JWK_REGISTRY: StellarContractId | undefined;
    VERIFIER: StellarContractId | undefined;
} {
    const cfg = getStellarConfig();
    return {
        JWK_REGISTRY: cfg.jwkRegistryAddress,
        VERIFIER: cfg.verifierAddress,
    };
}
