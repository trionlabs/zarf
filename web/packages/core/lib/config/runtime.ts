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

export type StellarNetworkId = 'testnet' | 'mainnet' | (string & {});

export interface StellarRuntimeConfig {
    id?: StellarNetworkId;
    label?: string;
    rpcUrl?: string;
    horizonUrl?: string;
    networkPassphrase?: string;
    factoryAddress?: StellarContractId;
    vestingAddress?: StellarContractId;
    jwkRegistryAddress?: StellarContractId;
    verifierAddress?: StellarContractId;
    tokenAddress?: StellarContractId;
    explorerBaseUrl?: string;
    networkName?: string;
    deployerAddress?: StellarAddress;
}

export interface CoreRuntimeConfig {
    /** Active/default Stellar/Soroban runtime configuration. */
    stellar: StellarRuntimeConfig;
    /** Optional named Stellar/Soroban profiles for runtime network switching. */
    stellarNetworks?: Partial<Record<StellarNetworkId, StellarRuntimeConfig>>;
    defaultStellarNetwork?: StellarNetworkId;
}

export interface StellarNetworkOption {
    id: StellarNetworkId;
    label: string;
    networkPassphrase?: string;
    configured: boolean;
}

export const STELLAR_NETWORK_STORAGE_KEY = 'zarf_stellar_network';

let _config: CoreRuntimeConfig | null = null;
let _activeStellarNetworkId: StellarNetworkId | null = null;
const _configResettersForTests = new Set<() => void>();
const _networkListeners = new Set<(id: StellarNetworkId, config: StellarRuntimeConfig) => void>();

function normalizeNetworkName(name?: string, passphrase?: string): string {
    if (name) return name;
    if (passphrase === 'Public Global Stellar Network ; September 2015') return 'PUBLIC';
    if (passphrase === 'Test SDF Network ; September 2015') return 'TESTNET';
    if (passphrase === 'Test SDF Future Network ; October 2022') return 'FUTURENET';
    return 'CUSTOM';
}

function networkEntries(): Array<[StellarNetworkId, StellarRuntimeConfig]> {
    if (!_config?.stellarNetworks) return [];
    return Object.entries(_config.stellarNetworks).filter(
        (entry): entry is [StellarNetworkId, StellarRuntimeConfig] => Boolean(entry[1]),
    );
}

function isConfigured(config: StellarRuntimeConfig): boolean {
    return Boolean(
        config.rpcUrl &&
            config.horizonUrl &&
            config.networkPassphrase &&
            config.factoryAddress &&
            config.explorerBaseUrl,
    );
}

function getActiveNetworkConfig(): StellarRuntimeConfig {
    if (!_config) {
        throw new Error(
            '[core] configureCore was not called. ' +
                'Add it to your app root (e.g. src/lib/coreInit.ts imported from +layout.ts).',
        );
    }

    if (_activeStellarNetworkId && _config.stellarNetworks?.[_activeStellarNetworkId]) {
        return _config.stellarNetworks[_activeStellarNetworkId]!;
    }

    return _config.stellar;
}

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

    const entries = networkEntries();
    const defaultNetwork = config.defaultStellarNetwork;
    const hasDefault = defaultNetwork && config.stellarNetworks?.[defaultNetwork];
    _activeStellarNetworkId = hasDefault
        ? defaultNetwork
        : entries[0]?.[0] ?? config.stellar.id ?? null;
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
    return getActiveNetworkConfig();
}

export function getConfiguredStellarNetworks(): StellarNetworkOption[] {
    const entries = networkEntries();
    if (entries.length === 0) {
        const stellar = getStellarConfig();
        return [
            {
                id: stellar.id ?? 'testnet',
                label: stellar.label ?? normalizeNetworkName(stellar.networkName, stellar.networkPassphrase),
                networkPassphrase: stellar.networkPassphrase,
                configured: isConfigured(stellar),
            },
        ];
    }

    return entries.map(([id, config]) => ({
        id,
        label: config.label ?? normalizeNetworkName(config.networkName, config.networkPassphrase),
        networkPassphrase: config.networkPassphrase,
        configured: isConfigured(config),
    }));
}

export function getActiveStellarNetworkId(): StellarNetworkId {
    const activeConfig = getStellarConfig();
    return _activeStellarNetworkId ?? activeConfig.id ?? 'testnet';
}

export function setActiveStellarNetwork(id: StellarNetworkId): void {
    if (!_config) {
        throw new Error('[core] configureCore was not called.');
    }
    const next = _config.stellarNetworks?.[id];
    if (!next) {
        throw new Error(`[core] unknown Stellar network profile: ${id}`);
    }
    if (!isConfigured(next)) {
        throw new Error(`[core] Stellar network profile is incomplete: ${id}`);
    }

    if (_activeStellarNetworkId === id) return;
    _activeStellarNetworkId = id;

    for (const reset of _configResettersForTests) {
        reset();
    }
    for (const listener of _networkListeners) {
        listener(id, next);
    }
}

export function subscribeStellarNetworkChange(
    listener: (id: StellarNetworkId, config: StellarRuntimeConfig) => void,
): () => void {
    _networkListeners.add(listener);
    return () => _networkListeners.delete(listener);
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
    _activeStellarNetworkId = null;
    for (const reset of _configResettersForTests) {
        reset();
    }
}
