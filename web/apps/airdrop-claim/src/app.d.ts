/**
 * Global type declarations for the airdrop-claim app.
 */

/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly [key: string]: string | boolean | undefined;
    // Declared (though this app never uses Google auth) so the shared
    // ZarfNavbar → googleAuth.ts import narrows to `string`, not the index
    // signature's `string | boolean | undefined`.
    readonly VITE_GOOGLE_CLIENT_ID?: string;
    readonly VITE_INDEXER_URL?: string;
    readonly VITE_TELEMETRY_ENDPOINT?: string;
    readonly VITE_STELLAR_DEFAULT_NETWORK?: string;
    readonly VITE_STELLAR_TESTNET_RPC_URL?: string;
    readonly VITE_STELLAR_TESTNET_FACTORY_ADDRESS?: string;
    readonly VITE_STELLAR_MAINNET_RPC_URL?: string;
    readonly VITE_STELLAR_MAINNET_FACTORY_ADDRESS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
