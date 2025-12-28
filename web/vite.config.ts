import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		wasm(),
		topLevelAwait(),
		nodePolyfills({
			include: ['buffer', 'crypto', 'stream', 'util', 'events', 'string_decoder', 'http'],
			globals: { Buffer: true },
		}),
	],
	// Load .env from parent directory (project root)
	envDir: '..',
	optimizeDeps: {
		exclude: ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi'],
		esbuildOptions: {
			target: 'esnext',
			// Node.js global to browser globalThis
			define: {
				global: 'globalThis',
			},
		},
	},
	build: {
		commonjsOptions: {
			// Handle mixed CJS/ESM modules (wagmi, walletconnect)
			transformMixedEsModules: true,
		},
	},
	worker: {
		format: 'es',
		plugins: () => [wasm(), topLevelAwait()],
	},
	server: {
		headers: {
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin',
		},
		fs: {
			allow: ['..'],
		},
	},
	resolve: {
		alias: {
			// Fix for pino error in wagmi/walletconnect
			pino: 'pino/browser',
		},
	},
	// Global polyfill for "global is not defined" errors
	define: {
		global: 'globalThis',
	},
});
