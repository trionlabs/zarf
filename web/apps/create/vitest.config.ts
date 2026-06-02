import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Pure-logic unit tests (registry/search). Component tests, if added
        // later, would need the Svelte plugin + a DOM environment.
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
