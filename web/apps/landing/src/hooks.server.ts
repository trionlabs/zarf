import type { Handle } from '@sveltejs/kit';

// Landing is a static marketing surface — no wallet, no WASM, no Soroban
// fetches. Apply defense-in-depth headers without a strict CSP (which
// would require a build + smoke pass to confirm the inline theme FOUC
// script and Google Fonts links are accounted for). Two narrow CSP
// directives ship now because they restrict only navigation/forms, not
// fetches — safe for any inline-script setup:
//   - base-uri 'self'   blocks <base href="…"> hijack of relative URLs
//   - form-action 'self' blocks rogue form-submit injection
export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    response.headers.set('Content-Security-Policy', `base-uri 'self'; form-action 'self';`);
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
    return response;
};
