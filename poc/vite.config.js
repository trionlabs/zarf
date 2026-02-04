import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: '..',
  build: {
    sourcemap: false,
    target: 'esnext',
  },
  plugins: [
    svelte(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'events', 'string_decoder'],
      globals: { Buffer: true },
    }),
  ],
  resolve: {
    alias: {
      // Point to web-compatible builds of Noir packages
      '@noir-lang/acvm_js': path.resolve(
        __dirname,
        'node_modules/@noir-lang/acvm_js/web/acvm_js.js'
      ),
      '@noir-lang/noirc_abi': path.resolve(
        __dirname,
        'node_modules/@noir-lang/noirc_abi/web/noirc_abi_wasm.js'
      ),
      // Pino shim for browser compatibility
      pino: path.resolve(__dirname, 'src/lib/pinoShim.js'),
    },
  },
  optimizeDeps: {
    exclude: ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  assetsInclude: ['**/*.wasm', '**/*.wasm.gz'],
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    fs: {
      allow: ['..'],
    },
  },
});
