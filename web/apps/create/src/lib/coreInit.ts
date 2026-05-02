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

function parseOptionalBigIntEnv(name: string): bigint | undefined {
    const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
    const raw = env[name];
    if (!raw) return undefined;
    try {
        const parsed = BigInt(raw);
        if (parsed < 0n) throw new Error('must be non-negative');
        return parsed;
    } catch {
        throw new Error(`Invalid ${name}: "${raw}"`);
    }
}

function parseActiveChainId(): number {
    const raw = (import.meta.env.VITE_ACTIVE_CHAIN_ID ||
        import.meta.env.VITE_CHAIN_ID ||
        String(SEPOLIA)) as string;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid VITE_ACTIVE_CHAIN_ID: "${raw}"`);
    }
    return parsed;
}

const factoryDeployBlockSepolia = (() => {
    return parseOptionalBigIntEnv('VITE_FACTORY_DEPLOY_BLOCK_SEPOLIA');
})();

configureCore({
    activeChainId: parseActiveChainId(),
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
