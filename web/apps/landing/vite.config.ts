import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { visualizer } from 'rollup-plugin-visualizer';

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
        visualizer({
            filename: 'stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
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
