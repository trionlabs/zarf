import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';

const connectSrc = dev
    ? "connect-src 'self' http://localhost:* ws://localhost:* https://* wss://* data: blob:"
    : "connect-src 'self' https://* wss://* data: blob:";

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; ${connectSrc}; img-src 'self' data: https:; worker-src 'self' blob:;`
    );
    return response;
};
