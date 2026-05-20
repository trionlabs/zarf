#!/usr/bin/env node
// Explicit-`any` allow-list gate.
//
// Mirrors the bundle-budget pattern: grep the tree for explicit `any`
// usages, compare against a hand-maintained allow-list, exit non-zero if
// anything outside the list shows up. The allow-list is the single
// place where exceptions are admitted, with a reason for each.
//
// Why a grep script and not eslint:
//   eslint setup in this monorepo would pull in @typescript-eslint +
//   eslint-plugin-svelte + per-app config + surface dozens of unrelated
//   warnings on first run. That's a Phase 7 tooling investment. This
//   script is the same idiom as scripts/check-bundle-budget.mjs and
//   keeps Phase 6 scope honest.
//
// Match model:
//   For each allow-list entry, we match on file + exact trimmed line
//   content (line numbers are advisory because they drift on edits).
//   If you legitimately need a new `any`, add an entry with a reason —
//   reviewer can object on the reason, not on the typing concession.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ANY_PATTERN = /:\s*any\b|<any>|\bas any\b/;

const WEB_ROOT = resolve(import.meta.dirname, '..');
const SCAN_ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'dist', 'build', '.turbo']);
const SCAN_EXTS = new Set(['.ts', '.tsx', '.svelte', '.svelte.ts', '.mjs']);

// Allow-list: { file (relative to web/), entries: [{ content, reason }] }.
// `content` matches the trimmed line exactly. Reason is for reviewers
// and future-you — be specific about why this site cannot be typed.
const ALLOWLIST = {
    'packages/core/lib/utils/error.ts': [
        { content: "* 'fallback'` pattern without resorting to `: any` or hand-rolling the",
          reason: 'JSDoc backtick reference to the pattern this helper replaces' },
    ],

    // ZK proof worker — runs in a Web Worker, dynamically imports
    // @noir-lang and @aztec/bb.js modules which have no .d.ts shipped
    // in the worker context. Promoting these to proper types would
    // require maintaining a parallel type fork (rejected in Phase 1).
    'packages/core/lib/zk/proof.worker.ts': [
        { content: '(globalThis as any).Buffer = Buffer;',
          reason: 'Buffer polyfill for worker globalThis' },
        { content: 'let Noir: any;',
          reason: 'lazy binding for @noir-lang/noir_js dynamic import' },
        { content: 'let UltraHonkBackend: any;',
          reason: 'lazy binding for @aztec/bb.js dynamic import' },
        { content: 'let generateInputs: any;',
          reason: 'lazy binding for noir-jwt dynamic import' },
        { content: 'let initACVM: any;',
          reason: 'lazy binding for @noir-lang/acvm_js dynamic import' },
        { content: 'let initAbi: any;',
          reason: 'lazy binding for @noir-lang/noirc_abi dynamic import' },
        { content: 'publicKey: any; // JWK',
          reason: 'opaque JWK passed through from caller' },
        { content: 'let cachedCircuit: any = null;',
          reason: 'cached circuit ArrayBuffer/object — shape varies by Noir version' },
        { content: 'let cachedNoir: any = null;',
          reason: 'cached lazily-loaded Noir module instance' },
        { content: 'let cachedBackend: any = null;',
          reason: 'cached lazily-loaded backend instance' },
        { content: 'async function fetchCircuit(url: string, retries = 3): Promise<any> {',
          reason: 'returns ArrayBuffer-or-JSON depending on Noir circuit format' },
        { content: '} catch (error: any) {',
          reason: 'worker error path — message format varies across Noir/bb.js versions' },
        { content: '.map((b: any) => b.toString(16).padStart(2, \'0\'))',
          reason: 'Uint8Array byte callback — typed as number but bb.js sometimes hands BigInt' },
    ],

    'packages/core/lib/zk/index.ts': [
        { content: 'publicKey: any;',
          reason: 'JWK shape passed opaquely through to worker' },
        { content: 'let pendingRejecter: ((reason: any) => void) | null = null;',
          reason: 'rejecter signature mirrors Promise constructor (reason: any)' },
        { content: 'publicKey: any,',
          reason: 'JWK shape passed opaquely through to worker' },
    ],

    // SES/lockdown shim — patches Object.getOwnPropertyDescriptor and
    // touches globalThis feature-detection. The Object.* signatures use
    // any in lib.es5.d.ts, so the patch has to match.
    'packages/core/lib/utils/domPreserve.ts': [
        { content: "typeof (globalThis as any).lockdown === 'function',",
          reason: 'SES feature detection on globalThis' },
        { content: "typeof (globalThis as any).Compartment === 'function',",
          reason: 'SES feature detection on globalThis' },
        { content: 'if ((globalThis as any).__SES_SHIM_INSTALLED__) return;',
          reason: 'SES install marker on globalThis' },
        { content: 'Object.getOwnPropertyDescriptor = function(obj: any, prop: PropertyKey): PropertyDescriptor | undefined {',
          reason: 'Object.* patch signature must match lib.es5.d.ts (uses any)' },
        { content: 'get: function(this: any) { return this[prop]; }',
          reason: 'getter receiver type per Object.defineProperty contract' },
        { content: '(globalThis as any).__SES_SHIM_INSTALLED__ = true;',
          reason: 'SES install marker on globalThis' },
    ],

    // Generic JSON helpers — value/return are intentionally untyped.
    'packages/core/lib/utils/json.ts': [
        { content: 'export function safeStringify(value: any): string {',
          reason: 'generic JSON serializer — caller knows the shape' },
        { content: 'export function safeParse(text: string): any {',
          reason: 'generic JSON parser — caller narrows the result' },
    ],

    // bb.js Fr class — only available after dynamic import.
    'packages/core/lib/crypto/merkleTree.ts': [
        { content: 'let FrClass: any = null;',
          reason: 'lazy bb.js Fr class binding — no .d.ts for dynamic import' },
    ],

    // Buffer polyfill in app entry points.
    'apps/claim/src/hooks.client.ts': [
        { content: '(globalThis as any).Buffer = Buffer;',
          reason: 'Buffer polyfill required by stellar-sdk' },
    ],
    'apps/create/src/hooks.client.ts': [
        { content: '(globalThis as any).Buffer = Buffer;',
          reason: 'Buffer polyfill required by stellar-sdk' },
    ],

    // Vite import.meta typing isn't picked up in this package source file.
    'packages/ui/lib/stores/walletStore.svelte.ts': [
        { content: "if ((import.meta as any).env.DEV) console.warn('Failed to fetch balance', e);",
          reason: 'Vite import.meta.env types not visible in package source — TODO: tsconfig fix' },
    ],

    // Svelte rest-spread to native input — type system limitation when
    // the spread target is a primitive HTML element.
    'packages/ui/lib/components/ui/ZenInput.svelte': [
        { content: '{...rest as any}',
          reason: 'Svelte rest-spread to <input> — Snippet type system cannot infer the cross-product' },
    ],

    // Snippet typing TODO — should be Snippet<[]> from svelte.
    'apps/create/src/lib/components/distributions/DistributionEmptyState.svelte': [
        { content: 'action?: any;',
          reason: 'TODO: type as Snippet<[]> from svelte — punted until DistributionEmptyState usages audited' },
    ],
};

function* walkSource(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            yield* walkSource(p);
        } else if (e.isFile()) {
            // Accept multi-segment extensions like .svelte.ts as well as
            // single-segment .ts / .svelte.
            const isMatch = [...SCAN_EXTS].some((ext) => e.name.endsWith(ext));
            if (isMatch) yield p;
        }
    }
}

function findAnyHits(filePath) {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    const hits = [];
    lines.forEach((line, i) => {
        if (ANY_PATTERN.test(line)) {
            hits.push({ line: i + 1, content: line.trim() });
        }
    });
    return hits;
}

function isAllowed(relFile, trimmedContent) {
    const entries = ALLOWLIST[relFile];
    if (!entries) return false;
    return entries.some((entry) => entry.content === trimmedContent);
}

const offenders = [];
let totalScanned = 0;
let totalHits = 0;
let totalAllowed = 0;

for (const root of SCAN_ROOTS) {
    const absRoot = resolve(WEB_ROOT, root);
    if (!statSync(absRoot, { throwIfNoEntry: false })) continue;
    for (const file of walkSource(absRoot)) {
        totalScanned++;
        const rel = relative(WEB_ROOT, file);
        for (const hit of findAnyHits(file)) {
            totalHits++;
            if (isAllowed(rel, hit.content)) {
                totalAllowed++;
            } else {
                offenders.push({ file: rel, ...hit });
            }
        }
    }
}

console.log(`Explicit-any allow-list check`);
console.log(`  scanned: ${totalScanned} files`);
console.log(`  hits:    ${totalHits}`);
console.log(`  allowed: ${totalAllowed}`);
console.log(`  new:     ${offenders.length}\n`);

if (offenders.length > 0) {
    console.error('Disallowed explicit `any` usages:\n');
    for (const o of offenders) {
        console.error(`  ${o.file}:${o.line}`);
        console.error(`    ${o.content}`);
    }
    console.error(
        '\nFix the typing, or add an entry to ALLOWLIST in ' +
        'web/scripts/check-any-allow-list.mjs with a specific reason. ' +
        'The reason is the artifact a reviewer will challenge — be concrete.'
    );
    process.exit(1);
}

console.log('No new explicit `any` usages.');
