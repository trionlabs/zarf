import type { Handle } from '@sveltejs/kit';

// Landing is a static marketing surface with one security-critical duty: it
// receives the Google OAuth callback (a live id_token in the URL fragment)
// and forwards it to the claim app. That makes script injection here as
// dangerous as on the claim app itself, so it gets a full strict CSP.
// script-src comes from kit.csp (svelte.config.js) with a per-request nonce
// covering SvelteKit's bootstrap and the nonce'd theme script in app.html;
// the strict fallback only fires if kit.csp is removed.
const FALLBACK_SCRIPT_SRC = "script-src 'self'";

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    const kitCsp = response.headers.get('Content-Security-Policy');
    // Extract ONLY the script-src directive from SvelteKit's CSP (it carries the
    // per-request nonce) rather than assuming the whole header is script-src. If
    // kit.csp ever emits more than one directive, this avoids leaking its other
    // directives into our script-src slot and shadowing the ones set below.
    // Fails closed to the strict fallback when absent.
    const kitScriptSrc = kitCsp
        ?.split(';')
        .map((directive) => directive.trim())
        .find((directive) => directive === 'script-src' || directive.startsWith('script-src '));
    const scriptSrc = kitScriptSrc || FALLBACK_SCRIPT_SRC;
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://static.cloudflareinsights.com; img-src 'self' data:; worker-src 'self'; base-uri 'self'; form-action 'self';`,
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
    // Defense-in-depth: isolate the browsing context group. Landing has no
    // wallet flow and no popup/opener use. COEP intentionally not added
    // (no SharedArrayBuffer usage; require-corp would break cross-origin
    // font/image loads with zero current gain).
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return response;
};
