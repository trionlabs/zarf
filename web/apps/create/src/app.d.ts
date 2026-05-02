/**
 * Global type declarations for Zarf web application
 */

/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

// Environment variables
interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID?: string;
    readonly VITE_PIN_PROXY_URL?: string;
    readonly VITE_STELLAR_RPC_URL: string;
    readonly VITE_STELLAR_HORIZON_URL: string;
    readonly VITE_STELLAR_NETWORK_PASSPHRASE: string;
    readonly VITE_STELLAR_NETWORK_NAME?: string;
    readonly VITE_STELLAR_FACTORY_ADDRESS: string;
    readonly VITE_STELLAR_VESTING_ADDRESS?: string;
    readonly VITE_STELLAR_JWK_REGISTRY_ADDRESS?: string;
    readonly VITE_STELLAR_VERIFIER_ADDRESS?: string;
    readonly VITE_STELLAR_TOKEN_ADDRESS?: string;
    readonly VITE_STELLAR_NATIVE_TOKEN_ADDRESS?: string;
    readonly VITE_STELLAR_EXPLORER_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
