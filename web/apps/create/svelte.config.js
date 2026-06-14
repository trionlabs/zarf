import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: vitePreprocess(),

    kit: {
        // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
        // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
        // See https://svelte.dev/docs/kit/adapters for more information about adapters.
        adapter: adapter(),
        // Generates a per-request nonce covering SvelteKit's inline bootstrap
        // and the `%sveltekit.nonce%` scripts in app.html. Only script-src is
        // configured here; hooks.server.ts merges it into the full policy
        // (connect-src depends on env-driven origins).
        csp: {
            mode: 'auto',
            directives: {
                'script-src': [
                    'self',
                    'wasm-unsafe-eval',
                    'blob:',
                    'https://static.cloudflareinsights.com',
                ],
            },
        },
        alias: {
            '@zarf/ui': '../../packages/ui/lib',
            '@zarf/ui/*': '../../packages/ui/lib/*',
        },
    },
};

export default config;
