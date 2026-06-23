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
    // CSP — note the deliberate ASYMMETRY with create.zarf.to (which dropped
    // 'unsafe-eval'): claim.zarf.to runs the FULL Noir prover, and
    // @noir-lang/acvm_js@1.0.0-beta.18 ships a wasm-bindgen shim
    //   imports.wbg.__wbg_newnoargs = (a,b) => new Function(getStringFromWasm0(a,b))
    // (web/acvm_js.js:712). `new Function` is gated by 'unsafe-eval', and the ACVM
    // can invoke that shim during witness generation. Dropping 'unsafe-eval' here
    // would only surface at proof time — every claim would break in production —
    // so it is RETAINED pending a full end-to-end proof run under the narrowed
    // policy in a real browser (blocked on a deployed test campaign + OAuth).
    // This is the eval-posture split working as designed: create (Pedersen/bb.js
    // only, proven eval-free) hardens; claim (Noir ACVM) cannot yet.
    // 'cdn.jsdelivr.net' WAS dropped from script-src — verified unused (the acvm
    // /noirc_abi WASM is served same-origin from /wasm, the circuit from
    // /circuits). NOTE: this is script-src only; bb.js is NOT fully self-hosted —
    // it fetches the UltraHonk SRS from https://crs.aztec.network on a cold cache,
    // which is allow-listed in connect-src (see COMMON_CONNECT_ORIGINS above), NOT
    // here. The full prover path (incl. the retained 'unsafe-eval' and the SRS
    // fetch) still needs one real end-to-end cold-browser proof to be certified.
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline' blob: https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; ${connectSrc}; img-src 'self' data: https:; worker-src 'self' blob:; base-uri 'self'; form-action 'self';`,
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
