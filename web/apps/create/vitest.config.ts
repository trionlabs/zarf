import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            $lib: resolve(root, 'src/lib'),
        },
    },
    test: {
        // Pure-logic unit tests (registry/search). Component tests, if added
        // later, would need the Svelte plugin + a DOM environment.
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
