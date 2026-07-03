import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter(),
        // Per-request nonce for SvelteKit's inline bootstrap and the nonce'd
        // theme script in app.html. hooks.server.ts extracts this script-src
        // (with its nonce) and merges it into the full CSP header. The waitlist
        // has OAuth-bearing endpoints, so it gets a strict, eval-free policy.
        csp: {
            mode: 'auto',
            directives: {
                'script-src': ['self'],
            },
        },
    },
};

export default config;
