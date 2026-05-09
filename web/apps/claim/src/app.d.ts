/**
 * Global type declarations for Zarf web application
 */

/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

// Environment variables
interface ImportMetaEnv {
    readonly [key: string]: string | boolean | undefined;
    readonly VITE_GOOGLE_CLIENT_ID?: string;
    readonly VITE_PIN_PROXY_URL?: string;
    readonly VITE_STELLAR_DEFAULT_NETWORK?: string;
    readonly VITE_STELLAR_RPC_URL?: string;
    readonly VITE_STELLAR_FACTORY_ADDRESS?: string;
    readonly VITE_STELLAR_TESTNET_RPC_URL?: string;
    readonly VITE_STELLAR_TESTNET_FACTORY_ADDRESS?: string;
    readonly VITE_STELLAR_MAINNET_RPC_URL?: string;
    readonly VITE_STELLAR_MAINNET_FACTORY_ADDRESS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
