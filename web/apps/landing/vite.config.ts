import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    esbuild: {
        drop: ['debugger'],
        pure: ['console.log', 'console.info', 'console.debug'],
    },
    plugins: [
        tailwindcss(),
        sveltekit(),
        nodePolyfills({
            include: ['buffer'],
            globals: { Buffer: false, global: false, process: false },
        }),
    ],
    envDir: '../..',
    server: {
        port: 5173,
        fs: {
            allow: ['../..']
        }
    },
    resolve: {
        conditions: ['browser', 'module', 'import', 'default'],
    },
    optimizeDeps: {
        exclude: ['@zarf/ui']
    },
    define: {
        global: 'globalThis',
    },
    ssr: {
        noExternal: [/vite-plugin-node-polyfills/],
    },
});
