import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        // See https://svelte.dev/docs/kit/adapters for more information about adapters.
        adapter: adapter(),
        // Per-request nonce for SvelteKit's inline bootstrap and the nonce'd
        // theme script in app.html. Landing handles the Google OAuth callback
        // (a live id_token rides the URL fragment), so it gets the strictest
        // script policy of the three apps; hooks.server.ts merges this into
        // the full header.
        csp: {
            mode: 'auto',
            directives: {
                'script-src': ['self', 'https://static.cloudflareinsights.com'],
            },
        },
    },
};

export default config;
