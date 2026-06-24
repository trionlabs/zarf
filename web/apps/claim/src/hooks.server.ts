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
    'https://www.googleapis.com',
    'https://horizon-testnet.stellar.org',
    'https://horizon.stellar.org',
    // UltraHonk SRS: bb.js (UltraHonkBackend, constructed with no crsPath in
    // proof.worker.ts) fetches g1.dat/g2.dat from crs.aztec.network on a cold
    // IndexedDB cache (net_crs.js). Without this, the FIRST claim on a fresh
    // browser is connect-src-blocked at proof time. Returning browsers cache the
    // SRS in IndexedDB, which is why this stayed latent.
    'https://crs.aztec.network',
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
        import.meta.env.VITE_STELLAR_RPC_URL,
        import.meta.env.VITE_PIN_PROXY_URL,
        import.meta.env.VITE_STELLAR_HORIZON_URL,
        import.meta.env.VITE_STELLAR_TESTNET_RPC_URL,
        import.meta.env.VITE_STELLAR_TESTNET_HORIZON_URL,
        import.meta.env.VITE_STELLAR_MAINNET_RPC_URL,
        import.meta.env.VITE_STELLAR_MAINNET_HORIZON_URL,
        import.meta.env.VITE_INDEXER_URL,
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

// script-src is owned by SvelteKit's kit.csp (svelte.config.js): it generates a
// per-request nonce, stamps it on the framework's inline bootstrap and the
// `%sveltekit.nonce%` scripts in app.html, and injects it as a <meta> CSP — it
// does NOT populate the Content-Security-Policy HTTP header. The previous code
// read that (always-null) header and fell back to a nonce-less script-src, so
// the header policy blocked the nonce'd bootstrap and hydration never ran. We
// now capture the real nonce from the rendered HTML and reuse the *same* value
// in the header's script-src so the header and the <meta> policy agree. This
// keeps `default-src 'self'` (whose fallback would otherwise gate the inline
// bootstrap to 'self'). The no-nonce branch only applies to non-HTML responses
// (assets) that carry no inline scripts; it never reopens 'unsafe-inline'.
// Mirror any kit.csp script-src change here so both policies stay in agreement.
//
// claim-only ASYMMETRY vs create: 'unsafe-eval' is REQUIRED here because
// @noir-lang/acvm_js@1.0.0-beta.18 ships a wasm-bindgen shim
//   imports.wbg.__wbg_newnoargs = (a,b) => new Function(getStringFromWasm0(a,b))
// (web/acvm_js.js:712) that the ACVM can invoke during witness generation;
// 'new Function' is gated by 'unsafe-eval'. It must appear in BOTH this header
// AND kit.csp's <meta> script-src (svelte.config.js) — the browser enforces the
// intersection, so a missing entry on either side re-breaks proofs. The nonce
// keeps inline scripts locked down (strictly stronger than the old
// 'unsafe-inline'); 'unsafe-eval' only relaxes eval/new Function, not inline
// injection. The UltraHonk SRS fetch (crs.aztec.network) is in connect-src, not
// here. Still pending the P0-1 cold-browser proof certification.
const SCRIPT_SRC_BASE =
    "'self' 'wasm-unsafe-eval' 'unsafe-eval' blob: https://static.cloudflareinsights.com";

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
    // Non-CSP defense-in-depth headers. HSTS is two years + includeSubDomains;
    // safe because all *.zarf.to subdomains are HTTPS via Cloudflare. `preload`
    // is a hint — actual preload-list inclusion requires manual submission at
    // hstspreload.org and remains opt-in.
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
    // Defense-in-depth: isolate the browsing context group. Code-grep
    // confirms no in-app window.open / window.opener / cross-origin
    // postMessage use; Freighter's content-script bridge is expected to
    // be unaffected by COOP same-origin, but the wallet-connect flow
    // should be smoke-tested in a real browser before relying on this
    // header for production. COEP intentionally not added (no
    // SharedArrayBuffer usage; require-corp would break cross-origin
    // font/image loads with zero current gain).
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return response;
};
