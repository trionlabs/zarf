#!/usr/bin/env node
// Direct-console.* allow-list gate.
//
// Mirrors scripts/check-any-allow-list.mjs. Greps the tree for direct
// console.log/warn/error/info/debug/trace calls and compares against a
// hand-maintained allow-list. New direct sites outside the list fail
// the build.
//
// Why a grep script and not eslint:
//   Same answer as the explicit-any gate — no eslint config in this
//   monorepo; full setup is a Phase 7 tooling investment. Coarse match
//   ("any console.* outside list is forbidden") is exactly the Phase
//   6.2 policy, so grep's lack of expressivity is not a flaw here.
//
// Match model:
//   For each file in the allow-list, an entry can either:
//     - Whole-file allow (entries: 'whole-file', reason: '...')
//       used for backend workers, the helper impl, Web Workers,
//       and other contexts where the dev/warn/err wrappers are
//       inapplicable.
//     - Per-line allow (entries: [{ content, reason }, ...])
//       matched by file + exact trimmed line content. Line numbers
//       are advisory because they drift on edits.
//
// Post-6.2.b: every direct console.* in frontend + frontend-shared
// packages either uses the helpers, or is allow-listed below with a
// specific non-helper reason (DEV-gated, JSDoc, bootstrap chatter,
// crypto warning, backend worker, vite.config string-literal).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const CONSOLE_PATTERN = /\bconsole\.(log|warn|error|info|debug|trace)\b/;

const WEB_ROOT = resolve(import.meta.dirname, '..');
const SCAN_ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'dist', 'build', '.turbo', '.wrangler']);
const SCAN_EXTS = new Set(['.ts', '.tsx', '.svelte', '.svelte.ts', '.mjs', '.js']);

const WHOLE_FILE = 'whole-file';

const ALLOWLIST = {
    // Helper impl — the one place direct console.* is intentional.
    'packages/core/lib/utils/log.ts': {
        entries: WHOLE_FILE,
        reason: 'helper impl + JSDoc references to the API it wraps',
    },

    // Vite configs reference 'console.log' etc as esbuild.pure string
    // literals — they're configuring the strip, not calling console.
    'apps/claim/vite.config.ts': {
        entries: WHOLE_FILE,
        reason: 'esbuild.pure string-literal references, not real calls',
    },
    'apps/create/vite.config.ts': {
        entries: WHOLE_FILE,
        reason: 'esbuild.pure string-literal references, not real calls',
    },
    'apps/landing/vite.config.ts': {
        entries: WHOLE_FILE,
        reason: 'esbuild.pure string-literal references, not real calls',
    },

    // Cloudflare Worker — no Vite, no esbuild.pure, dev() helper does
    // not apply (import.meta.env.DEV is undefined in workerd). Stays on
    // direct console.* until a backend log helper lands.
    // TODO Phase 8: backend log helper (pino / wrangler-aware gate).
    'apps/indexer/src/index.ts': {
        entries: WHOLE_FILE,
        reason: 'backend Cloudflare Worker — no Vite DEV gate available',
    },
    'apps/jwk-rotation/src/index.ts': {
        entries: WHOLE_FILE,
        reason: 'scheduled Cloudflare Worker — no Vite DEV gate available',
    },

    // Web Worker — runs off the main thread, has its own log channel,
    // conversion adds complexity for zero observable win.
    'packages/core/lib/zk/proof.worker.ts': {
        entries: WHOLE_FILE,
        reason: 'Web Worker — separate log channel, intentional direct calls',
    },
    // ZK prover host bridge — mirrors worker-side log shape. 5 stable
    // sites pinned per-line so a 6th call must justify itself.
    'packages/core/lib/zk/index.ts': {
        entries: [
            {
                content: "console.error('[ZK Prover Error]', message);",
                reason: 'forwards worker error to host console — intentional direct call',
            },
            {
                content: "console.error('[ZK Prover] onProgress threw:', e);",
                reason: 'catch around user-supplied callback — intentional direct call',
            },
            {
                content: "console.log('[ZK Prover]', message);",
                reason: 'progress passthrough from worker — intentional direct call',
            },
            {
                content: "console.error('[ZK Prover Worker Error]', e);",
                reason: 'unhandled worker error — intentional',
            },
            {
                content: "console.error('Failed to initialize ZK Worker:', e);",
                reason: 'worker init failure — intentional, surfaces in prod logs',
            },
        ],
    },

    // Build script — CLI feedback during `pnpm build`. The DEV helper
    // and warn/err wrappers are runtime-only (import.meta.env.DEV is
    // undefined in build-time Node scripts). Stays on direct console.*
    // until a build-script log helper lands.
    'packages/core/scripts/copy-wasm.js': {
        entries: WHOLE_FILE,
        reason: 'build script — CLI progress + error feedback, no runtime gate available',
    },

    // App bootstrap shim chatter — operators rely on these lines in
    // prod logs to confirm SES + Buffer polyfill activation.
    'apps/claim/src/hooks.client.ts': {
        entries: [
            {
                content: "console.log('[hooks.client] SES compatibility shim active');",
                reason: 'bootstrap confirmation visible in prod logs',
            },
            {
                content: "console.log('[hooks.client] Buffer polyfill installed');",
                reason: 'bootstrap confirmation visible in prod logs',
            },
        ],
    },
    'apps/create/src/hooks.client.ts': {
        entries: [
            {
                content: "console.log('[hooks.client] SES compatibility shim active');",
                reason: 'bootstrap confirmation visible in prod logs',
            },
            {
                content: "console.log('[hooks.client] Buffer polyfill installed');",
                reason: 'bootstrap confirmation visible in prod logs',
            },
        ],
    },

    // SES install path — intentional shim-install confirmation.
    'packages/core/lib/utils/domPreserve.ts': {
        entries: [
            {
                content: "console.log('[DOM Preserve] SES compatibility shim installed');",
                reason: 'SES install marker — ships intentionally',
            },
            {
                content:
                    "console.warn('[DOM Preserve] app.html shim not detected, installing runtime fallback');",
                reason: 'fallback-install warning — ships intentionally',
            },
            {
                content: "console.log('[DOM Preserve] SES compatibility shim verified');",
                reason: 'SES verify marker — ships intentionally',
            },
        ],
    },

    // JSDoc examples only — the Math.random fallback (and its "Warning:
    // Using non-secure RNG" warn) was deleted in the K1 security audit
    // fix; modern Web Crypto is the sole path.
    'packages/core/lib/crypto/merkleTree.ts': {
        entries: [
            {
                content: '* console.log(tree.root); // Root hash',
                reason: 'JSDoc example, not a real call',
            },
            {
                content: '* console.log(tree.minDepth); // Minimal tree depth',
                reason: 'JSDoc example, not a real call',
            },
        ],
    },

    // JSDoc examples in googleAuth — the real warn calls have been
    // converted to warn() in 6.2.b; only the JSDoc samples remain.
    'packages/ui/lib/utils/googleAuth.ts': {
        entries: [
            {
                content: '*     console.log(decoded.payload.email);',
                reason: 'JSDoc example, not a real call',
            },
            {
                content: '* console.log(decoded.payload.email); // user@example.com',
                reason: 'JSDoc example, not a real call',
            },
            {
                content: '* console.log(decoded.header.kid);    // Key ID for verification',
                reason: 'JSDoc example, not a real call',
            },
        ],
    },

    // Already DEV-gated at the call site (manual `if (import.meta.env.DEV)`).
    // The walletStore entry preserves the explicit (import.meta as any) cast
    // that the any-list also exempts — there's a tsconfig fix tracked there.
    'packages/ui/lib/stores/walletStore.svelte.ts': {
        entries: [
            {
                content:
                    "if ((import.meta as any).env.DEV) console.warn('Failed to fetch balance', e);",
                reason: 'already DEV-gated at call site; the cast itself is allow-listed in check-any',
            },
        ],
    },
    'packages/ui/lib/utils/errorSanitizer.ts': {
        entries: [
            {
                content: "console.error('[sanitizeBlockchainError] unmatched:', err);",
                reason: 'inside `if (import.meta.env.DEV)` block — already gated',
            },
        ],
    },

    // OAuth error logging on the landing page. The original code wraps
    // a console.warn in `if (DEBUG)` (DEV-only). Converting to warn()
    // would change behavior (always ships to prod console), which is a
    // product question — not just a code-style swap — so it's
    // intentionally deferred until product decides whether OAuth errors
    // should hit the future telemetry hook. If/when promoted: drop the
    // DEBUG wrapper, swap to warn(), remove this entry.
    'apps/landing/src/routes/+page.svelte': {
        entries: [
            {
                content: "console.warn('[Landing] OAuth Error detected:', hash);",
                reason: 'DEV-gated via DEBUG constant — telemetry seam vs DEV-only is a product call, deferred',
            },
        ],
    },
};

function* walkSource(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            yield* walkSource(p);
        } else if (e.isFile()) {
            const isMatch = [...SCAN_EXTS].some((ext) => e.name.endsWith(ext));
            if (isMatch) yield p;
        }
    }
}

function findConsoleHits(filePath) {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    const hits = [];
    lines.forEach((line, i) => {
        if (CONSOLE_PATTERN.test(line)) {
            hits.push({ line: i + 1, content: line.trim() });
        }
    });
    return hits;
}

function isAllowed(relFile, trimmedContent) {
    const entry = ALLOWLIST[relFile];
    if (!entry) return false;
    if (entry.entries === WHOLE_FILE) return true;
    return entry.entries.some((e) => e.content === trimmedContent);
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
        for (const hit of findConsoleHits(file)) {
            totalHits++;
            if (isAllowed(rel, hit.content)) {
                totalAllowed++;
            } else {
                offenders.push({ file: rel, ...hit });
            }
        }
    }
}

console.log(`Direct-console.* allow-list check`);
console.log(`  scanned: ${totalScanned} files`);
console.log(`  hits:    ${totalHits}`);
console.log(`  allowed: ${totalAllowed}`);
console.log(`  new:     ${offenders.length}\n`);

if (offenders.length > 0) {
    console.error('Disallowed direct console.* calls:\n');
    for (const o of offenders) {
        console.error(`  ${o.file}:${o.line}`);
        console.error(`    ${o.content}`);
    }
    console.error(
        '\nUse the dev/devTag/warn/err helpers from @zarf/core/utils/log, ' +
            'or add an entry to ALLOWLIST in web/scripts/check-console-allow-list.mjs ' +
            'with a specific reason. Direct console.* outside the helper is ' +
            'forbidden so future telemetry has a single insertion point.',
    );
    process.exit(1);
}

console.log('No new direct console.* calls.');
