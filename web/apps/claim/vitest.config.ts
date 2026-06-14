import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: {
            '@zarf/core': fileURLToPath(new URL('../../packages/core/lib', import.meta.url)),
        },
    },
});
