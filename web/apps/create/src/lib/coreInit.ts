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

const env = import.meta.env as Record<string, string | boolean | undefined>;

function readEnv(name: string): string | undefined {
    const value = env[name];
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
});
