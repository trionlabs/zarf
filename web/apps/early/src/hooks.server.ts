import type { Handle } from '@sveltejs/kit';
import { getSubjectBySessionId } from '$lib/server/db';
import { readSessionCookie, clearSessionCookie } from '$lib/server/session';
import { logServerError, ERROR_CODES } from '$lib/server/errors';

function originMismatch(event: Parameters<Handle>[0]['event']): boolean {
    const method = event.request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
    const origin = event.request.headers.get('origin');
    if (!origin) return true;
    let originHost: string;
    try {
        originHost = new URL(origin).host;
    } catch {
        return true;
    }
    return originHost !== event.url.host;
}

// Strict script policy comes from kit.csp (svelte.config.js) with a per-request
// nonce covering SvelteKit's bootstrap + the nonce'd theme script in app.html;
// this strict fallback only fires if kit.csp is removed.
const FALLBACK_SCRIPT_SRC = "script-src 'self'";

const SECURITY_HEADERS: Record<string, string> = {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
};

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.user = null;
    event.locals.sessionId = null;

    const sessionId = readSessionCookie(event.cookies);
    if (sessionId) {
        const db = event.platform?.env.DB;
        if (db) {
            try {
                const subject = await getSubjectBySessionId(db, sessionId);
                if (subject) {
                    event.locals.user = subject;
                    event.locals.sessionId = sessionId;
                } else {
                    clearSessionCookie(event.cookies);
                }
            } catch (e) {
                logServerError('hooks.session', ERROR_CODES.INTERNAL, e);
            }
        }
    }

    // Origin-mismatch CSRF guard on every state-changing /api/ and /admin/api/
    // request. All /api/ traffic originates from the same origin.
    const path = event.url.pathname;
    const guardedApi = path.startsWith('/api/') || path.startsWith('/admin/api/');
    if (guardedApi && originMismatch(event)) {
        return new Response('forbidden: origin mismatch', { status: 403 });
    }

    const response = await resolve(event);

    // Full CSP: reuse the nonce'd script-src SvelteKit emitted (kit.csp), keep
    // the rest strict. Google Fonts (Saira/JetBrains Mono) need googleapis in
    // style-src + gstatic in font-src, matching landing 1:1. X profile avatars
    // load from pbs/abs.twimg.com. eval-free: no 'unsafe-eval' anywhere.
    const kitCsp = response.headers.get('Content-Security-Policy');
    const kitScriptSrc = kitCsp
        ?.split(';')
        .map((directive) => directive.trim())
        .find((directive) => directive === 'script-src' || directive.startsWith('script-src '));
    const scriptSrc = kitScriptSrc || FALLBACK_SCRIPT_SRC;
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data: https://pbs.twimg.com https://abs.twimg.com; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';`
    );

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        response.headers.set(name, value);
    }
    return response;
};
