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
// Phase 6.2.a scope: dev/devTag conversion + drift gate. Direct
// console.warn / console.error in app code remain allow-listed pending
// the 6.2.b wrapper sweep that retires them. Each such entry carries
// reason: 'phase-6.2.b' so the future tightening pass can find them
// with a single grep.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const CONSOLE_PATTERN = /\bconsole\.(log|warn|error|info|debug|trace)\b/;

const WEB_ROOT = resolve(import.meta.dirname, '..');
const SCAN_ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'dist', 'build', '.turbo']);
const SCAN_EXTS = new Set(['.ts', '.tsx', '.svelte', '.svelte.ts', '.mjs']);

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
    'packages/core/lib/zk/index.ts': {
        entries: WHOLE_FILE,
        reason: 'ZK prover host bridge — mirrors worker-side log shape',
    },

    // App bootstrap shim chatter — operators rely on these lines in
    // prod logs to confirm SES + Buffer polyfill activation.
    'apps/claim/src/hooks.client.ts': {
        entries: [
            { content: "console.log('[hooks.client] SES compatibility shim active');",
              reason: 'bootstrap confirmation visible in prod logs' },
            { content: "console.log('[hooks.client] Buffer polyfill installed');",
              reason: 'bootstrap confirmation visible in prod logs' },
        ],
    },
    'apps/create/src/hooks.client.ts': {
        entries: [
            { content: "console.log('[hooks.client] SES compatibility shim active');",
              reason: 'bootstrap confirmation visible in prod logs' },
            { content: "console.log('[hooks.client] Buffer polyfill installed');",
              reason: 'bootstrap confirmation visible in prod logs' },
        ],
    },

    // SES install path — intentional shim-install confirmation.
    'packages/core/lib/utils/domPreserve.ts': {
        entries: [
            { content: "console.log('[DOM Preserve] SES compatibility shim installed');",
              reason: 'SES install marker — ships intentionally' },
            { content: "console.warn('[DOM Preserve] app.html shim not detected, installing runtime fallback');",
              reason: 'fallback-install warning — ships intentionally' },
            { content: "console.log('[DOM Preserve] SES compatibility shim verified');",
              reason: 'SES verify marker — ships intentionally' },
        ],
    },

    // Crypto security warning — must always ship regardless of env.
    'packages/core/lib/crypto/merkleTree.ts': {
        entries: [
            { content: "console.warn('Warning: Using non-secure RNG for salt generation');",
              reason: 'crypto security warning — must always ship' },
            { content: "* console.log(tree.root); // Root hash",
              reason: 'JSDoc example, not a real call' },
            { content: "* console.log(tree.minDepth); // Minimal tree depth",
              reason: 'JSDoc example, not a real call' },
        ],
    },

    // JSDoc examples + duplicate real calls in googleAuth.
    // Note: oauth-state parsing is duplicated in apps/landing/src/lib/utils/oauth.ts
    // and packages/ui/lib/utils/googleAuth.ts — both warn lines below
    // also appear there with the same content.
    'packages/ui/lib/utils/googleAuth.ts': {
        entries: [
            { content: "*     console.log(decoded.payload.email);",
              reason: 'JSDoc example, not a real call' },
            { content: "* console.log(decoded.payload.email); // user@example.com",
              reason: 'JSDoc example, not a real call' },
            { content: "* console.log(decoded.header.kid);    // Key ID for verification",
              reason: 'JSDoc example, not a real call' },
            { content: "console.warn('[OAuth] Invalid address in state, ignoring');",
              reason: 'phase-6.2.b — wrapper conversion pending (duplicate of landing/oauth.ts)' },
            { content: "console.warn('[OAuth] Failed to parse state:', e);",
              reason: 'phase-6.2.b — wrapper conversion pending (duplicate of landing/oauth.ts)' },
            { content: "console.warn('[Auth] Invalid contract address format, not preserving');",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },

    // Already DEV-gated at the call site (manual `if (import.meta.env.DEV)`).
    // The walletStore entry preserves the explicit (import.meta as any) cast
    // that the any-list also exempts — there's a tsconfig fix tracked there.
    'packages/ui/lib/stores/walletStore.svelte.ts': {
        entries: [
            { content: "if ((import.meta as any).env.DEV) console.warn('Failed to fetch balance', e);",
              reason: 'already DEV-gated at call site; the cast itself is allow-listed in check-any' },
        ],
    },
    'packages/ui/lib/utils/errorSanitizer.ts': {
        entries: [
            { content: "console.error('[sanitizeBlockchainError] unmatched:', err);",
              reason: 'inside `if (import.meta.env.DEV)` block — already gated' },
        ],
    },

    // ──────────────────────────────────────────────────────────────────
    // Phase 6.2.b allow-list (direct console.warn / console.error in
    // app code + frontend-shared packages). The 6.2.b sweep converts
    // these to warn() / err() wrappers and removes the entries from
    // this list in the same commit.
    // ──────────────────────────────────────────────────────────────────

    'apps/claim/src/lib/components/claim/DistributionCard.svelte': {
        entries: [
            { content: 'console.error("Failed to load details", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/lib/components/claim/ImportContractInput.svelte': {
        entries: [
            { content: 'console.error("Failed to fetch vault metadata", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/lib/components/claim/steps/ClaimStep1Identify.svelte': {
        entries: [
            { content: 'console.error("Unlock failed:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/lib/components/claim/steps/ClaimStep5Submit.svelte': {
        entries: [
            { content: 'console.error("Submission failed:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/lib/services/claimActions.ts': {
        entries: [
            { content: "console.error('Discovery failed:', e);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/lib/services/emailFilter.ts': {
        entries: [
            { content: "console.warn(`[EmailFilter] Distribution not found: ${address}`);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.warn(`[EmailFilter] Skipping distribution with unreadable IPFS metadata:`, error.message);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.error(`[EmailFilter] Error checking distribution:`, error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/lib/stores/claimStore.svelte.ts': {
        entries: [
            { content: "console.warn('[claimStore] Could not find epoch for commitment:', commitmentLower);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.warn('Failed to recover claim session', e);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/lib/utils/googleJwk.ts': {
        entries: [
            { content: "console.error('[GoogleJWK] Fetch error:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/claim/src/routes/+page.svelte': {
        entries: [
            { content: 'console.error("[Claim] Failed to filter distributions:", error);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: 'console.warn("[Claim] Chain discovery failed", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: 'console.error("[Claim] Auth failed:", err);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/create/src/lib/components/wizard/deploy/DeployStep1.svelte': {
        entries: [
            { content: 'console.error("Pin error:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: 'console.error("Merkle generation error:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/create/src/lib/components/wizard/deploy/DeployStep3Connect.svelte': {
        entries: [
            { content: 'console.error("Balance check failed:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: 'console.error("Connection failed:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/create/src/lib/components/wizard/deploy/DeployStep4Deploy.svelte': {
        entries: [
            { content: 'console.warn("Optimistic cache update failed", err);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: 'console.error("Deploy failed:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/create/src/lib/stores/deployStore.svelte.ts': {
        entries: [
            { content: 'console.warn("Failed to save deploy state", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: 'console.warn("Failed to load deploy state", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/create/src/lib/stores/wizardStore.svelte.ts': {
        entries: [
            { content: "console.warn('[WizardStore] Failed to persist:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.warn('[WizardStore] Failed to restore, clearing storage:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/create/src/routes/distributions/+page.svelte': {
        entries: [
            { content: 'console.error("Discovery failed:", e);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/landing/src/routes/+page.svelte': {
        entries: [
            { content: 'console.warn("[Landing] OAuth Error detected:", hash);',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'apps/landing/src/lib/utils/oauth.ts': {
        entries: [
            { content: "console.warn('[OAuth] Invalid address in state, ignoring');",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.warn('[OAuth] Failed to parse state:', e);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'packages/core/lib/domain/epochDiscovery.ts': {
        entries: [
            { content: "console.warn(`[Discovery] Status check failed for epoch ${index}`, err);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'packages/core/lib/services/distribution.ts': {
        entries: [
            { content: "console.error('[Distribution] Failed to fetch data:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'packages/core/lib/services/distributionDiscovery.ts': {
        entries: [
            { content: "console.warn('[DiscoveryService] Indexer metadata read failed:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'packages/core/lib/services/vestingDiscovery.ts': {
        entries: [
            { content: "console.warn('[VestingDiscovery] Indexer discovery failed:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.warn('[VestingDiscovery] Indexer CID read failed:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'packages/ui/lib/components/wallet/WalletConnectButton.svelte': {
        entries: [
            { content: 'console.warn("Clipboard API not available");',
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'packages/ui/lib/stores/authStore.svelte.ts': {
        entries: [
            { content: "console.warn('[AuthStore] Session expired, clearing...');",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.log('[AuthStore] Session restored for:', payload.email);",
              reason: 'phase-6.2.b — dev() conversion pending (out of 6.2.a claim-side scope)' },
            { content: "console.error('[AuthStore] Failed to restore session:', e);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
        ],
    },
    'packages/ui/lib/stores/themeStore.svelte.ts': {
        entries: [
            { content: "console.warn('[ThemeStore] Failed to persist theme:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
            { content: "console.warn('[ThemeStore] Failed to restore theme:', error);",
              reason: 'phase-6.2.b — wrapper conversion pending' },
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
        'forbidden so future telemetry has a single insertion point.'
    );
    process.exit(1);
}

console.log('No new direct console.* calls.');
