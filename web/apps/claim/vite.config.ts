import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';
import { createRequire } from 'node:module';

const requireFromHere = createRequire(import.meta.url);
// Pre-resolve pino's browser entry against this app's node_modules so
// the virtual shim below can reference an absolute path. The bare
// `pino/browser.js` specifier used to work in `vite dev` but Rollup's
// production build resolves imports relative to the importing module,
// and a virtual module has no on-disk location to walk from.
const PINO_BROWSER_PATH = requireFromHere.resolve('pino/browser.js');

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

// pino@9.x's browser.js does `module.exports = pino` with no named
// `pino` export. @aztec/bb.js's browser-side log module does
// `import { pino } from 'pino'`, which resolves to undefined after
// Vite's CJS-to-ESM interop and crashes Barretenberg init with
// `does not provide an export named 'pino'`. Intercept the bare `pino`
// import and serve a virtual module that re-exports the factory under
// both `default` and a named `pino` export. The inner import is
// baked from PINO_BROWSER_PATH (absolute, resolved at config eval
// time) so Rollup's production pass can resolve it — a bare
// `pino/browser.js` specifier works for `vite dev` but Rollup walks
// relative to the importing module and the virtual id has none.
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
			`import pinoFactory from ${JSON.stringify(PINO_BROWSER_PATH)};`,
			'export default pinoFactory;',
			'export const pino = pinoFactory;',
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
			pinoNamedShim(),
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
			/vite-plugin-node-polyfills/,
		],
	},
	// Global polyfill for "global is not defined" errors
	define: {
		global: 'globalThis',
	},
});
