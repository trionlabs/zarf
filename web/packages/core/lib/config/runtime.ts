/**
 * Core Runtime Configuration
 *
 * `@zarf/core` is a domain package. It must NOT read `import.meta.env` directly,
 * because that couples it to Vite and to specific app-level env-var names.
 *
 * Apps configure core once at boot via `configureCore({...})` and core reads
 * configured values lazily through `getCoreConfig()`. Tests and non-Vite
 * consumers (Node, server-side, future workers) can configure core with mocks.
 *
 * @module config/runtime
 */
import type { StellarAddress, StellarContractId } from '../types';

export interface StellarRuntimeConfig {
    rpcUrl?: string;
    horizonUrl?: string;
    networkPassphrase?: string;
    factoryAddress?: StellarContractId;
    vestingAddress?: StellarContractId;
    jwkRegistryAddress?: StellarContractId;
    verifierAddress?: StellarContractId;
    tokenAddress?: StellarContractId;
    nativeTokenAddress?: StellarContractId;
    explorerBaseUrl?: string;
    networkName?: string;
    deployerAddress?: StellarAddress;
}

export interface CoreRuntimeConfig {
    /** Stellar/Soroban runtime configuration. */
    stellar: StellarRuntimeConfig;
}

let _config: CoreRuntimeConfig | null = null;
const _configResettersForTests = new Set<() => void>();

/**
 * Configure core. Call once from the app's root layout, before any code that
 * may reach into `getCoreConfig()`.
 *
 * Calling twice throws — apps should not silently overwrite a configuration.
 */
export function configureCore(config: CoreRuntimeConfig): void {
    if (_config) {
        throw new Error(
            '[core] configureCore called twice. Configure once at app boot.',
        );
    }
    _config = config;
}

/**
 * Read the current runtime config. Throws if `configureCore` was not called.
 */
export function getCoreConfig(): CoreRuntimeConfig {
    if (!_config) {
        throw new Error(
            '[core] configureCore was not called. ' +
                'Add it to your app root (e.g. src/lib/coreInit.ts imported from +layout.ts).',
        );
    }
    return _config;
}

export function getStellarConfig(): StellarRuntimeConfig {
    return getCoreConfig().stellar;
}

/**
 * Register a config-derived cache resetter. Services with memoized clients use
 * this so `__resetCoreConfigForTests()` can rebuild them after reconfiguration.
 */
export function __registerCoreConfigResetterForTests(reset: () => void): void {
    _configResettersForTests.add(reset);
}

/**
 * Test-only escape hatch: reset the configured singleton so tests can call
 * `configureCore` again with different inputs. Do not call from app code.
 */
export function __resetCoreConfigForTests(): void {
    _config = null;
    for (const reset of _configResettersForTests) {
        reset();
    }
}
