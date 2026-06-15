/**
 * Global type declarations for the airdrop-create app.
 */

/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly [key: string]: string | boolean | undefined;
    readonly VITE_INDEXER_URL?: string;
    readonly VITE_PIN_PROXY_URL?: string;
    readonly VITE_TELEMETRY_ENDPOINT?: string;
    readonly VITE_STELLAR_DEFAULT_NETWORK?: string;
    readonly VITE_STELLAR_TESTNET_RPC_URL?: string;
    readonly VITE_STELLAR_TESTNET_AIRDROP_FACTORY_ADDRESS?: string;
    readonly VITE_STELLAR_MAINNET_RPC_URL?: string;
    readonly VITE_STELLAR_MAINNET_AIRDROP_FACTORY_ADDRESS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
