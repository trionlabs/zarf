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
        // (connect-src depends on env-driven origins). No 'unsafe-eval' /
        // 'unsafe-inline': WASM compiles under 'wasm-unsafe-eval', inline
        // scripts are nonce'd. blob: stays for browsers that gate worker
        // creation on script-src; cloudflareinsights allows zone-level Web
        // Analytics auto-injection.
        csp: {
            mode: 'auto',
            directives: {
                'script-src': [
                    'self',
                    'wasm-unsafe-eval',
                    // Required by @noir-lang/acvm_js's `new Function` shim during
                    // witness generation (see hooks.server.ts). Must match the
                    // header script-src in hooks.server.ts; the browser enforces
                    // the intersection of this <meta> policy and that header.
                    'unsafe-eval',
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
