import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Lean config: the airdrop tool has NO ZK deps (bb.js / noir), so none of the
// create app's wasm / noir-vendor / pino stub machinery is carried here. Only
// the Stellar SDK + buffer handling that any Soroban dapp needs.
export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    // Load .env from the monorepo root (shared across apps).
    envDir: '../..',
    optimizeDeps: {
        include: [
            'buffer',
            '@stellar/stellar-sdk',
            '@stellar/freighter-api',
            'lucide-svelte',
            'svelte/transition',
            'svelte/animate',
            'svelte/easing',
            'svelte/store',
        ],
        esbuildOptions: {
            target: 'esnext',
            define: { global: 'globalThis' },
        },
    },
    build: {
        target: 'esnext',
        commonjsOptions: { transformMixedEsModules: true },
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (id.includes('node_modules')) {
                        if (
                            id.includes('/buffer/') ||
                            id.includes('/base64-js/') ||
                            id.includes('/ieee754/')
                        ) {
                            return 'buffer-vendor';
                        }
                        if (id.includes('@stellar')) return 'stellar-vendor';
                        if (id.includes('svelte')) return 'ui-vendor';
                    }
                },
            },
        },
    },
    define: { global: 'globalThis' },
    ssr: {
        external: ['buffer'],
    },
    server: {
        fs: { allow: ['../..'] },
    },
});
