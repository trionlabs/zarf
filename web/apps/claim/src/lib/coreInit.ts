/**
 * One-time core configuration. Imported as a side-effect from
 * `src/routes/+layout.ts` so it runs before any module that touches
 * `getCoreConfig()` (wallet RPC bootstraps, distribution discovery, etc.).
 *
 * App-specific env-var names live here, NOT in @zarf/core.
 */
import { configureCore } from '@zarf/core/config/runtime';

function requiredEnv(name: keyof ImportMetaEnv): string {
    const value = import.meta.env[name];
    if (!value) throw new Error(`Missing required ${name}`);
    return value;
}

configureCore({
    stellar: {
        rpcUrl: requiredEnv('VITE_STELLAR_RPC_URL'),
        horizonUrl: requiredEnv('VITE_STELLAR_HORIZON_URL'),
        networkPassphrase: requiredEnv('VITE_STELLAR_NETWORK_PASSPHRASE'),
        networkName: import.meta.env.VITE_STELLAR_NETWORK_NAME,
        factoryAddress: requiredEnv('VITE_STELLAR_FACTORY_ADDRESS'),
        vestingAddress: import.meta.env.VITE_STELLAR_VESTING_ADDRESS,
        jwkRegistryAddress: import.meta.env.VITE_STELLAR_JWK_REGISTRY_ADDRESS,
        verifierAddress: import.meta.env.VITE_STELLAR_VERIFIER_ADDRESS,
        tokenAddress: import.meta.env.VITE_STELLAR_TOKEN_ADDRESS,
        nativeTokenAddress: import.meta.env.VITE_STELLAR_NATIVE_TOKEN_ADDRESS,
        explorerBaseUrl: requiredEnv('VITE_STELLAR_EXPLORER_URL'),
    },
});
