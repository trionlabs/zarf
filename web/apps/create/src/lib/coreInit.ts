/**
 * One-time core configuration. Imported as a side-effect from
 * `src/routes/+layout.ts` so it runs before any module that touches
 * `getCoreConfig()` (wallet RPC bootstraps, distribution discovery, etc.).
 *
 * App-specific env-var names live here, NOT in @zarf/core.
 */
import { configureCore } from '@zarf/core/config/runtime';
import type { Address } from 'viem';

const SEPOLIA = 11155111;
const MAINNET = 1;

const factoryDeployBlockSepolia = (() => {
    const raw = import.meta.env.VITE_FACTORY_DEPLOY_BLOCK_SEPOLIA as string | undefined;
    if (!raw) return undefined;
    try { return BigInt(raw); } catch { return undefined; }
})();

configureCore({
    rpcUrls: {
        [SEPOLIA]: import.meta.env.VITE_SEPOLIA_RPC_URL || import.meta.env.VITE_RPC_URL,
        [MAINNET]: import.meta.env.VITE_MAINNET_RPC_URL,
    },
    factoryAddresses: {
        [SEPOLIA]: import.meta.env.VITE_FACTORY_ADDRESS_SEPOLIA as Address | undefined,
        [MAINNET]: import.meta.env.VITE_FACTORY_ADDRESS_MAINNET as Address | undefined,
    },
    factoryDeployBlocks: {
        [SEPOLIA]: factoryDeployBlockSepolia,
    },
    vestingAddress: import.meta.env.VITE_VESTING_ADDRESS as Address | undefined,
    jwkRegistryAddress: import.meta.env.VITE_JWK_REGISTRY_ADDRESS as Address | undefined,
    verifierAddress: import.meta.env.VITE_VERIFIER_ADDRESS as Address | undefined,
});
