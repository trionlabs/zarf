import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Stub optional wagmi connector dependencies and large browser-only libraries
const productionStub = (): Plugin => {
	const wagmiDeps = [
		'@base-org/account',
		'@coinbase/wallet-sdk',
		'@gemini-wallet/core',
		'@metamask/sdk',
		'@safe-global/sdk-starter-kit',
		'@safe-global/safe-apps-sdk',
		'@safe-global/safe-apps-provider',
		'@wallet-standard/features',
		'@walletconnect/ethereum-provider',
		'@walletconnect/modal',
		'@walletconnect/universal-provider',
		'porto',
		'porto/internal'
	];
	const largeBrowserDeps = [
		'@aztec/bb.js',
		'@noir-lang/noir_js',
		'@noir-lang/acvm_js',
		'@noir-lang/noirc_abi'
	];
	return {
		name: 'production-stub',
		enforce: 'pre',
		resolveId(id, importer, options) {
			if (wagmiDeps.includes(id)) {
				return '\0stub:' + id;
			}
			// Stub large deps only for SSR to keep worker size small
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

export default defineConfig({
	esbuild: {
		drop: ['debugger'],
		pure: ['console.log', 'console.info', 'console.debug'],
	},
	plugins: [
		productionStub(),
		tailwindcss(),
		sveltekit(),
		wasm(),
		topLevelAwait(),
		nodePolyfills({
			include: ['crypto', 'stream', 'util', 'events', 'buffer'],
			globals: { Buffer: false, global: false, process: false },
			protocolImports: true,
		}),
	],
	// Load .env from parent directory (project root)
	envDir: '../..',
	optimizeDeps: {
		exclude: ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi'],
		include: ['buffer', 'viem', 'viem/chains', '@wagmi/core', '@wagmi/connectors', 'lucide-svelte', 'svelte/transition', 'svelte/animate', 'svelte/easing', 'svelte/store'],
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
		chunkSizeWarningLimit: 4000,
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (id.includes('node_modules')) {
						if (id.includes('@noir-lang') || id.includes('@aztec') || id.includes('aztec')) {
							return 'noir-vendor';
						}
						if (id.includes('viem') || id.includes('wagmi') || id.includes('@wagmi')) {
							return 'web3-vendor';
						}
						if (id.includes('svelte')) {
							return 'ui-vendor';
						}
					}
				}
			}
		}
	},
	worker: {
		format: 'es',
		plugins: () => [
			wasm(),
			topLevelAwait(),
			nodePolyfills({
				include: ['buffer', 'crypto', 'stream', 'util', 'events'],
				globals: { Buffer: false, global: false, process: false },
			}),
		],
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
	ssr: {
		// Externalize buffer to use Node.js native Buffer during SSR
		external: ['buffer'],
		// Force bundle these to allow stubbing their optional deps/large libs
		noExternal: [
			'wagmi',
			'@wagmi/core',
			'@wagmi/connectors',
			'@aztec/bb.js',
			'@noir-lang/noir_js',
			'@noir-lang/acvm_js',
			'@noir-lang/noirc_abi',
			/vite-plugin-node-polyfills/,
		],
	},
});
