// Configure @zarf/core with this app's env vars on the server runtime too,
// so SSR'd code paths that reach into core don't crash on missing config.
import './lib/coreInit';
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';

const COMMON_CONNECT_ORIGINS = [
    'https://ipfs.io',
    'https://dweb.link',
    'https://gateway.pinata.cloud',
    'https://w3s.link',
    'https://horizon-testnet.stellar.org',
    'https://horizon.stellar.org',
];

function originFrom(value: string | boolean | undefined): string | null {
    if (typeof value !== 'string' || !value) return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function connectSources(): string {
    const configured = [
        import.meta.env.VITE_PIN_PROXY_URL,
        import.meta.env.VITE_STELLAR_RPC_URL,
        import.meta.env.VITE_STELLAR_HORIZON_URL,
        import.meta.env.VITE_STELLAR_TESTNET_RPC_URL,
        import.meta.env.VITE_STELLAR_TESTNET_HORIZON_URL,
        import.meta.env.VITE_STELLAR_MAINNET_RPC_URL,
        import.meta.env.VITE_STELLAR_MAINNET_HORIZON_URL,
        import.meta.env.VITE_INDEXER_URL,
    ]
        .map(originFrom)
        .filter((origin): origin is string => Boolean(origin));

    return Array.from(
        new Set(["'self'", 'data:', 'blob:', ...COMMON_CONNECT_ORIGINS, ...configured]),
    ).join(' ');
}

const connectSrc = dev
    ? `connect-src ${connectSources()} http://localhost:* ws://localhost:*`
    : `connect-src ${connectSources()}`;

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; ${connectSrc}; img-src 'self' data: https:; worker-src 'self' blob:;`,
    );
    return response;
};
