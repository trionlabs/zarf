import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';

// Stub large browser-only libraries during SSR.
const productionStub = (): Plugin => {
    const largeBrowserDeps = [
        '@aztec/bb.js',
        '@noir-lang/noir_js',
        '@noir-lang/acvm_js',
        '@noir-lang/noirc_abi',
    ];
    return {
        name: 'production-stub',
        enforce: 'pre',
        resolveId(id, importer, options) {
            if (options.ssr && largeBrowserDeps.includes(id)) {
                return '\0stub:' + id;
            }
            return null;
        },
        load(id) {
            if (id.startsWith('\0stub:')) {
                return 'export default {}';
            }
            return null;
        },
    };
};

// @aztec/bb.js's browser logger does `import { pino } from 'pino'`,
// but pino@9's browser entry is CommonJS and Vite dev can serve it as
// an ESM module with neither a named `pino` nor `default` export. bb.js
// only calls `pino(opts)`, `.child({ name })`, and `.debug()`, so keep
// pino out of the browser graph and provide the compatible surface
// directly. Verbose levels stay silent, but warn/error/fatal pass
// through to the console — Barretenberg init failures must not be
// swallowed by the logging shim.
const pinoNamedShim = (): Plugin => ({
    name: 'pino-named-shim',
    enforce: 'pre',
    resolveId(id) {
        if (id === 'pino') return '\0virtual:pino-named-shim';
        return null;
    },
    load(id) {
        if (id !== '\0virtual:pino-named-shim') return null;
        return [
            'const noop = () => {};',
            'function createLogger(opts = {}) {',
            '  const name = opts && opts.name ? String(opts.name) : "bb.js";',
            '  return {',
            '    child: (bindings = {}) =>',
            '      createLogger({ ...opts, ...bindings, name: bindings.name ?? name }),',
            '    trace: noop,',
            '    debug: noop,',
            '    info: noop,',
            '    verbose: noop,',
            '    warn: (...args) => console.warn(`[${name}]`, ...args),',
            '    error: (...args) => console.error(`[${name}]`, ...args),',
            '    fatal: (...args) => console.error(`[${name}]`, ...args),',
            '  };',
            '}',
            'export default createLogger;',
            'export const pino = createLogger;',
        ].join('\n');
    },
});

export default defineConfig({
    esbuild: {
        drop: ['debugger'],
        pure: ['console.log', 'console.info', 'console.debug'],
    },
    plugins: [
        productionStub(),
        pinoNamedShim(),
        tailwindcss(),
        sveltekit(),
        wasm(),
        topLevelAwait(),
        viteStaticCopy({
            targets: [
                { src: '../../packages/core/static/circuits/*', dest: 'circuits' },
                { src: '../../packages/core/static/wasm/*', dest: 'wasm' },
            ],
            structured: false,
        }),
        visualizer({
            filename: 'stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
        }),
    ],
    // Load .env from parent directory (project root)
    envDir: '../..',
    optimizeDeps: {
        exclude: [
            '@aztec/bb.js',
            '@noir-lang/noir_js',
            '@noir-lang/acvm_js',
            '@noir-lang/noirc_abi',
        ],
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
            // Node.js global to browser globalThis
            define: {
                global: 'globalThis',
            },
        },
    },
    build: {
        target: 'esnext',
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        chunkSizeWarningLimit: 4000,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (
                        id.includes('vite/preload-helper') ||
                        id.includes('vite/modulepreload-polyfill')
                    ) {
                        return 'vite-runtime';
                    }
                    if (id.includes('node_modules')) {
                        if (
                            id.includes('/buffer/') ||
                            id.includes('/base64-js/') ||
                            id.includes('/ieee754/')
                        ) {
                            return 'buffer-vendor';
                        }
                        if (
                            id.includes('@noir-lang') ||
                            id.includes('@aztec') ||
                            id.includes('aztec')
                        ) {
                            return 'noir-vendor';
                        }
                        if (id.includes('@stellar')) {
                            return 'stellar-vendor';
                        }
                        if (id.includes('svelte')) {
                            return 'ui-vendor';
                        }
                    }
                },
            },
        },
    },
    worker: {
        format: 'es',
        plugins: () => [pinoNamedShim(), wasm(), topLevelAwait()],
    },
    server: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        },
        fs: {
            allow: ['../..'],
        },
    },
    ssr: {
        // `external: ['buffer']` is a production-SSR belt: it tells the
        // Rollup SSR pass to use Node's native Buffer instead of the
        // npm buffer polyfill. It does NOT fix `vite dev` SSR — the dev
        // module runner will still try to evaluate `buffer/index.js`
        // and crash on its top-level require() if reachable. The real
        // fix is keeping the npm buffer package out of the SSR module
        // graph (see addressShape + dynamic contracts).
        external: ['buffer'],
        // Force bundle these to allow stubbing their large browser-only libs.
        noExternal: [
            '@aztec/bb.js',
            '@noir-lang/noir_js',
            '@noir-lang/acvm_js',
            '@noir-lang/noirc_abi',
        ],
    },
    // Global polyfill for "global is not defined" errors
    define: {
        global: 'globalThis',
    },
});
