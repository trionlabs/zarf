import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    esbuild: {
        drop: ['debugger'],
        pure: ['console.log', 'console.info', 'console.debug'],
    },
    plugins: [tailwindcss(), sveltekit()],
    envDir: '../..',
    server: {
        port: 5173,
        fs: {
            allow: ['../..'],
        },
    },
    resolve: {
        conditions: ['browser', 'module', 'import', 'default'],
    },
    optimizeDeps: {
        exclude: ['@zarf/ui'],
    },
    define: {
        global: 'globalThis',
    },
});
