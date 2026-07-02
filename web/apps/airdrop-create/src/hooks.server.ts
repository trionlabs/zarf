// Security headers for the airdrop-create app.
//
// Mirrors apps/create's hooks.server.ts but DELIBERATELY OMITS the ZK escape
// hatches: the airdrop tool ships NO bb.js / Noir / WASM prover, so script-src
// carries NO 'wasm-unsafe-eval' / 'unsafe-eval', no script-src blob:, and no
// https://cdn.jsdelivr.net. This keeps the airdrop origin on a strict
// default-src 'self' CSP with eval physically unreachable — the security win
// "double mode" buys by keeping this on its own origin, separate from the ZK
// create app (which MUST allow unsafe-eval).
//
// HEADERS ONLY: unlike apps/create this does NOT `import './lib/coreInit'`, so a
// misconfigured factory env can never turn header-setting into a hard 500. The
// app's own +layout.ts already runs configureCore() for render paths.
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';

// IPFS gateways (create reads back the pinned doc) + both Horizons.
const COMMON_CONNECT_ORIGINS = [
    'https://ipfs.io',
    'https://dweb.link',
    'https://gateway.pinata.cloud',
    'https://w3s.link',
    'https://horizon-testnet.stellar.org',
    'https://horizon.stellar.org',
    // Public testnet Soroban RPC default (mirrors the Horizon defaults so the
    // allowlist is self-contained; mainnet/custom RPC arrives via env below).
    'https://soroban-testnet.stellar.org',
];

function originFrom(value: string | boolean | undefined): string | null {
    if (typeof value !== 'string' || !value) return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

// Create needs the pin-proxy (to pin the distribution doc) in addition to
// Soroban RPC + Horizon + the read indexer.
function connectSources(): string {
    const configured = [
        import.meta.env.VITE_PIN_PROXY_URL,
        import.meta.env.VITE_STELLAR_TESTNET_RPC_URL,
        import.meta.env.VITE_STELLAR_TESTNET_HORIZON_URL,
        import.meta.env.VITE_STELLAR_MAINNET_RPC_URL,
        import.meta.env.VITE_STELLAR_MAINNET_HORIZON_URL,
        import.meta.env.VITE_INDEXER_URL,
        // setupErrorTelemetry() POSTs here when configured (coreInit.ts).
        import.meta.env.VITE_TELEMETRY_ENDPOINT,
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

// script-src is nonce-gated (no 'unsafe-inline'). kit.csp (svelte.config.js)
// stamps a per-request nonce on SvelteKit's bootstrap and the app.html
// %sveltekit.nonce% script and emits it as a <meta> CSP; we capture that nonce
// from the rendered HTML and reuse it in the header script-src so both policies
// agree. Eval-free: this app ships NO Noir/bb.js prover, so no
// 'unsafe-eval'/'wasm-unsafe-eval'.
const SCRIPT_SRC_BASE = "'self' https://static.cloudflareinsights.com";

export const handle: Handle = async ({ event, resolve }) => {
    let nonce = '';
    const response = await resolve(event, {
        transformPageChunk: ({ html }) => {
            if (!nonce) {
                const match = html.match(/\bnonce="([^"]+)"/);
                if (match) nonce = match[1];
            }
            return html;
        },
    });
    const scriptSrc = nonce
        ? `script-src ${SCRIPT_SRC_BASE} 'nonce-${nonce}'`
        : `script-src ${SCRIPT_SRC_BASE}`;
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; ${connectSrc}; img-src 'self' data: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`,
    );
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload',
    );
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=()',
    );
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return response;
};
