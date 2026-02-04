#!/usr/bin/env node

/**
 * Copy WASM files from @noir-lang packages to static/wasm/ for runtime access
 *
 * VERSION-AWARE: Reads the exact version from claim app's package.json
 * to ensure WASM binaries match the JS bindings.
 */

import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const webRoot = resolve(packageRoot, '..', '..');
const targetDir = join(packageRoot, 'static', 'wasm');

// Read version from claim app (the consumer of these WASM files)
function getNoirVersion() {
    const claimPkgPath = join(webRoot, 'apps', 'claim', 'package.json');

    if (existsSync(claimPkgPath)) {
        const pkg = JSON.parse(readFileSync(claimPkgPath, 'utf-8'));
        const version = pkg.dependencies?.['@noir-lang/acvm_js'];
        if (version) {
            console.log(`[copy-wasm] Using version from claim app: ${version}`);
            return version;
        }
    }

    // Fallback to core's peerDependencies
    const corePkgPath = join(packageRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(corePkgPath, 'utf-8'));
    const version = pkg.peerDependencies?.['@noir-lang/acvm_js'] || '1.0.0-beta.18';
    console.log(`[copy-wasm] Using version from core peerDeps: ${version}`);
    return version;
}

const NOIR_VERSION = getNoirVersion();

// Ensure target directory exists
mkdirSync(targetDir, { recursive: true });

// WASM files to copy - pinned to specific version
const wasmFiles = [
    {
        name: 'acvm_js_bg.wasm',
        pnpmPath: `@noir-lang+acvm_js@${NOIR_VERSION}/node_modules/@noir-lang/acvm_js/web/acvm_js_bg.wasm`,
    },
    {
        name: 'noirc_abi_wasm_bg.wasm',
        pnpmPath: `@noir-lang+noirc_abi@${NOIR_VERSION}/node_modules/@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm`,
    },
];

/**
 * Find WASM file in pnpm store with exact version
 */
function findWasmFile(pnpmPath) {
    // Try monorepo root node_modules/.pnpm
    const pnpmDir = join(webRoot, 'node_modules', '.pnpm');
    const fullPath = join(pnpmDir, pnpmPath);

    if (existsSync(fullPath)) {
        return fullPath;
    }

    console.warn(`[copy-wasm] Not found at: ${fullPath}`);
    return null;
}

let copied = 0;
let failed = 0;

for (const { name, pnpmPath } of wasmFiles) {
    const sourcePath = findWasmFile(pnpmPath);
    const targetPath = join(targetDir, name);

    if (!sourcePath) {
        console.error(`[copy-wasm] ERROR: Could not find ${name} for version ${NOIR_VERSION}`);
        console.error(`[copy-wasm] Run: pnpm install @noir-lang/acvm_js@${NOIR_VERSION}`);
        failed++;
        continue;
    }

    try {
        copyFileSync(sourcePath, targetPath);
        console.log(`[copy-wasm] ✓ Copied ${name} (${NOIR_VERSION})`);
        copied++;
    } catch (err) {
        console.error(`[copy-wasm] Error copying ${name}:`, err.message);
        failed++;
    }
}

console.log(`[copy-wasm] Done: ${copied} copied, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
