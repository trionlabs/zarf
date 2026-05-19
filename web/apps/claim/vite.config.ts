import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';

// Stub large browser-only libraries during SSR.
const productionStub = (): Plugin => {
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
			globals: { Buffer: 'build', global: false, process: false },
			protocolImports: true,
		}),
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
		exclude: ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi'],
		include: ['buffer', '@stellar/stellar-sdk', '@stellar/freighter-api', 'lucide-svelte', 'svelte/transition', 'svelte/animate', 'svelte/easing', 'svelte/store'],
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
			transformMixedEsModules: true,
		},
		chunkSizeWarningLimit: 4000,
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) {
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
						if (id.includes('@noir-lang') || id.includes('@aztec') || id.includes('aztec')) {
							return 'noir-vendor';
						}
						if (id.includes('@stellar')) {
							return 'stellar-vendor';
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
				globals: { Buffer: 'build', global: false, process: false },
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
	ssr: {
		// Externalize buffer to use Node.js native Buffer during SSR
		external: ['buffer'],
		// Force bundle these to allow stubbing their large browser-only libs.
		noExternal: [
			'@aztec/bb.js',
			'@noir-lang/noir_js',
			'@noir-lang/acvm_js',
			'@noir-lang/noirc_abi',
			/vite-plugin-node-polyfills/,
		],
	},
	// Global polyfill for "global is not defined" errors
	define: {
		global: 'globalThis',
	},
});
