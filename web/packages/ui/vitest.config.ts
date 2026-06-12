import { defineConfig } from 'vitest/config';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [svelte({ preprocess: vitePreprocess() })],
    // Resolve Svelte's client build so module-level runes ($state/$derived in
    // .svelte.ts) are reactive under test, not SSR no-ops.
    resolve: { conditions: ['browser'] },
    test: {
        include: ['lib/**/*.test.ts'],
        environment: 'happy-dom',
        alias: {
            // Stub SvelteKit's virtual env module so the store's browser-guarded
            // paths run under test.
            '$app/environment': fileURLToPath(
                new URL('./test/app-environment.ts', import.meta.url),
            ),
        },
    },
});
