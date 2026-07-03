import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),

    kit: {
        adapter: adapter(),
        // Per-request nonce for the inline bootstrap + the app.html
        // %sveltekit.nonce% script. hooks.server.ts captures this nonce and
        // mirrors it into the CSP response header. Eval-free app (no prover).
        csp: {
            mode: 'auto',
            directives: {
                'script-src': ['self', 'https://static.cloudflareinsights.com'],
            },
        },
        alias: {
            '@zarf/ui': '../../packages/ui/lib',
            '@zarf/ui/*': '../../packages/ui/lib/*',
        },
    },
};

export default config;
