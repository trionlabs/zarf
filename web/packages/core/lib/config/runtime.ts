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
import type { Address } from 'viem';

export interface CoreRuntimeConfig {
    /** Per-chain RPC URL overrides. If absent for a chain, public fallbacks are used. */
    rpcUrls: Partial<Record<number, string>>;
    /** Per-chain factory contract addresses. */
    factoryAddresses: Partial<Record<number, Address>>;
    /** Per-chain factory deploy block (used to bound event log scans). */
    factoryDeployBlocks?: Partial<Record<number, bigint>>;
    /** Optional: ZarfVesting contract address for direct (non-factory) flows. */
    vestingAddress?: Address;
    /** Optional: JWK registry contract for ZK proof verification. */
    jwkRegistryAddress?: Address;
    /** Optional: standalone Verifier contract (Honk/Mock). */
    verifierAddress?: Address;
}

let _config: CoreRuntimeConfig | null = null;

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

/**
 * Test-only escape hatch: reset the configured singleton so tests can call
 * `configureCore` again with different inputs. Do not call from app code.
 */
export function __resetCoreConfigForTests(): void {
    _config = null;
}
