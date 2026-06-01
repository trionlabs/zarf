/**
 * One-time core configuration. Imported as a side-effect from
 * `src/routes/+layout.ts` so it runs before any module that touches
 * `getCoreConfig()` (wallet RPC bootstraps, distribution discovery, etc.).
 *
 * App-specific env-var names live here, NOT in @zarf/core.
 */
import { configureCore } from '@zarf/core/config/runtime';
import {
    STELLAR_NETWORK_STORAGE_KEY,
    type StellarNetworkId,
    type StellarRuntimeConfig,
} from '@zarf/core/config/runtime';
import { browser } from '$app/environment';
import { setupErrorTelemetry } from '@zarf/core/utils/telemetry';

const DEFAULTS = {
    testnet: {
        horizonUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        explorerBaseUrl: 'https://stellar.expert/explorer/testnet',
    },
    mainnet: {
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        explorerBaseUrl: 'https://stellar.expert/explorer/public',
    },
} as const;

// Vite inlines `import.meta.env.X` only when accessed STATICALLY. Any whole-object
// access (`import.meta.env`, `env[name]`, spread, JSON.stringify) embeds EVERY
// VITE_* key into the client bundle. Enumerate keys here; never widen access.
const ENV: Readonly<Record<string, string | boolean | undefined>> = {
    VITE_INDEXER_URL: import.meta.env.VITE_INDEXER_URL,
    VITE_TELEMETRY_ENDPOINT: import.meta.env.VITE_TELEMETRY_ENDPOINT,
    VITE_STELLAR_DEFAULT_NETWORK: import.meta.env.VITE_STELLAR_DEFAULT_NETWORK,

    VITE_STELLAR_TESTNET_RPC_URL: import.meta.env.VITE_STELLAR_TESTNET_RPC_URL,
    VITE_STELLAR_TESTNET_HORIZON_URL: import.meta.env.VITE_STELLAR_TESTNET_HORIZON_URL,
    VITE_STELLAR_TESTNET_NETWORK_PASSPHRASE: import.meta.env
        .VITE_STELLAR_TESTNET_NETWORK_PASSPHRASE,
    VITE_STELLAR_TESTNET_NETWORK_NAME: import.meta.env.VITE_STELLAR_TESTNET_NETWORK_NAME,
    VITE_STELLAR_TESTNET_FACTORY_ADDRESS: import.meta.env.VITE_STELLAR_TESTNET_FACTORY_ADDRESS,
    VITE_STELLAR_TESTNET_VESTING_ADDRESS: import.meta.env.VITE_STELLAR_TESTNET_VESTING_ADDRESS,
    VITE_STELLAR_TESTNET_JWK_REGISTRY_ADDRESS: import.meta.env
        .VITE_STELLAR_TESTNET_JWK_REGISTRY_ADDRESS,
    VITE_STELLAR_TESTNET_VERIFIER_ADDRESS: import.meta.env.VITE_STELLAR_TESTNET_VERIFIER_ADDRESS,
    VITE_STELLAR_TESTNET_TOKEN_ADDRESS: import.meta.env.VITE_STELLAR_TESTNET_TOKEN_ADDRESS,
    VITE_STELLAR_TESTNET_EXPLORER_URL: import.meta.env.VITE_STELLAR_TESTNET_EXPLORER_URL,

    VITE_STELLAR_MAINNET_RPC_URL: import.meta.env.VITE_STELLAR_MAINNET_RPC_URL,
    VITE_STELLAR_MAINNET_HORIZON_URL: import.meta.env.VITE_STELLAR_MAINNET_HORIZON_URL,
    VITE_STELLAR_MAINNET_NETWORK_PASSPHRASE: import.meta.env
        .VITE_STELLAR_MAINNET_NETWORK_PASSPHRASE,
    VITE_STELLAR_MAINNET_NETWORK_NAME: import.meta.env.VITE_STELLAR_MAINNET_NETWORK_NAME,
    VITE_STELLAR_MAINNET_FACTORY_ADDRESS: import.meta.env.VITE_STELLAR_MAINNET_FACTORY_ADDRESS,
    VITE_STELLAR_MAINNET_VESTING_ADDRESS: import.meta.env.VITE_STELLAR_MAINNET_VESTING_ADDRESS,
    VITE_STELLAR_MAINNET_JWK_REGISTRY_ADDRESS: import.meta.env
        .VITE_STELLAR_MAINNET_JWK_REGISTRY_ADDRESS,
    VITE_STELLAR_MAINNET_VERIFIER_ADDRESS: import.meta.env.VITE_STELLAR_MAINNET_VERIFIER_ADDRESS,
    VITE_STELLAR_MAINNET_TOKEN_ADDRESS: import.meta.env.VITE_STELLAR_MAINNET_TOKEN_ADDRESS,
    VITE_STELLAR_MAINNET_EXPLORER_URL: import.meta.env.VITE_STELLAR_MAINNET_EXPLORER_URL,

    VITE_STELLAR_RPC_URL: import.meta.env.VITE_STELLAR_RPC_URL,
    VITE_STELLAR_HORIZON_URL: import.meta.env.VITE_STELLAR_HORIZON_URL,
    VITE_STELLAR_NETWORK_PASSPHRASE: import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE,
    VITE_STELLAR_NETWORK_NAME: import.meta.env.VITE_STELLAR_NETWORK_NAME,
    VITE_STELLAR_FACTORY_ADDRESS: import.meta.env.VITE_STELLAR_FACTORY_ADDRESS,
    VITE_STELLAR_VESTING_ADDRESS: import.meta.env.VITE_STELLAR_VESTING_ADDRESS,
    VITE_STELLAR_JWK_REGISTRY_ADDRESS: import.meta.env.VITE_STELLAR_JWK_REGISTRY_ADDRESS,
    VITE_STELLAR_VERIFIER_ADDRESS: import.meta.env.VITE_STELLAR_VERIFIER_ADDRESS,
    VITE_STELLAR_TOKEN_ADDRESS: import.meta.env.VITE_STELLAR_TOKEN_ADDRESS,
    VITE_STELLAR_EXPLORER_URL: import.meta.env.VITE_STELLAR_EXPLORER_URL,
};

function readEnv(name: string): string | undefined {
    const value = ENV[name];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readStoredNetwork(): StellarNetworkId | undefined {
    if (!browser) return undefined;
    const stored = window.localStorage.getItem(STELLAR_NETWORK_STORAGE_KEY);
    return stored === 'testnet' || stored === 'mainnet' ? stored : undefined;
}

function buildNetwork(
    id: 'testnet' | 'mainnet',
    label: string,
    fallbackToLegacy: boolean,
): StellarRuntimeConfig | null {
    const prefix = `VITE_STELLAR_${id.toUpperCase()}_`;
    const legacy = (suffix: string) =>
        fallbackToLegacy ? readEnv(`VITE_STELLAR_${suffix}`) : undefined;
    const value = (suffix: string) => readEnv(`${prefix}${suffix}`) ?? legacy(suffix);

    const config: StellarRuntimeConfig = {
        id,
        label,
        rpcUrl: value('RPC_URL'),
        horizonUrl: value('HORIZON_URL') ?? DEFAULTS[id].horizonUrl,
        networkPassphrase: value('NETWORK_PASSPHRASE') ?? DEFAULTS[id].networkPassphrase,
        networkName: value('NETWORK_NAME') ?? label,
        factoryAddress: value('FACTORY_ADDRESS'),
        vestingAddress: value('VESTING_ADDRESS'),
        jwkRegistryAddress: value('JWK_REGISTRY_ADDRESS'),
        verifierAddress: value('VERIFIER_ADDRESS'),
        tokenAddress: value('TOKEN_ADDRESS'),
        explorerBaseUrl: value('EXPLORER_URL') ?? DEFAULTS[id].explorerBaseUrl,
    };

    if (!config.rpcUrl || !config.factoryAddress) {
        return null;
    }

    return config;
}

const testnet = buildNetwork('testnet', 'Testnet', true);
const mainnet = buildNetwork('mainnet', 'Mainnet', false);
const stellarNetworks: Partial<Record<StellarNetworkId, StellarRuntimeConfig>> = {
    ...(testnet ? { testnet } : {}),
    ...(mainnet ? { mainnet } : {}),
};
const envDefault = readEnv('VITE_STELLAR_DEFAULT_NETWORK') as StellarNetworkId | undefined;
const storedDefault = readStoredNetwork();
const defaultStellarNetwork =
    storedDefault && stellarNetworks[storedDefault]
        ? storedDefault
        : envDefault && stellarNetworks[envDefault]
          ? envDefault
          : testnet
            ? 'testnet'
            : 'mainnet';
const stellar = stellarNetworks[defaultStellarNetwork];

if (!stellar) {
    throw new Error(
        'Missing Stellar network config. Configure VITE_STELLAR_TESTNET_* or VITE_STELLAR_MAINNET_* env vars.',
    );
}

configureCore({
    stellar,
    stellarNetworks,
    defaultStellarNetwork,
    indexerUrl: readEnv('VITE_INDEXER_URL'),
});

// Error telemetry — active only when an operator endpoint is configured;
// otherwise a no-op and nothing leaves the device. See @zarf/core/utils/telemetry.
if (browser) {
    setupErrorTelemetry({
        endpoint: readEnv('VITE_TELEMETRY_ENDPOINT'),
        context: `create@${defaultStellarNetwork}`,
    });
}
