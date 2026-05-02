/**
 * Global type declarations for Zarf web application
 */

/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

// Ethereum provider (MetaMask, etc.)
interface Window {
    ethereum?: {
        request: (args: { method: string; params?: any[] }) => Promise<any>;
        on: (event: string, callback: (...args: any[]) => void) => void;
        removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
}

// Environment variables
interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID?: string;
    readonly VITE_VESTING_ADDRESS?: string;
    readonly VITE_VERIFIER_ADDRESS?: string;
    readonly VITE_JWK_REGISTRY_ADDRESS?: string;
    readonly VITE_RPC_URL?: string;
    readonly VITE_NETWORK?: string;
    readonly VITE_ACTIVE_CHAIN_ID?: string;
    readonly VITE_CHAIN_ID?: string;
    readonly VITE_FACTORY_DEPLOY_BLOCK_SEPOLIA?: string;
    readonly VITE_SEPOLIA_RPC_URL?: string;
    readonly VITE_MAINNET_RPC_URL?: string;
    readonly VITE_PIN_PROXY_URL?: string;
    readonly VITE_FACTORY_ADDRESS_SEPOLIA?: string;
    readonly VITE_FACTORY_ADDRESS_MAINNET?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
