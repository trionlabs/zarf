#!/usr/bin/env node
// Bundle budget gate. Reads each app's Vite client manifest and the on-disk
// _app/immutable tree, computes two metrics per app, and exits non-zero if
// either exceeds its budget.
//
// Metrics:
//   - initialGz: worst-route initial paint (eager static-import closure of
//     entry/start + entry/app + nodes/0 root layout + the route's own node,
//     JS + CSS, gzip).
//   - totalGz: sum of every file in _app/immutable, gzip. Caps the total
//     surface a user can possibly hit while navigating the app.
//
// Budgets (claim ratchet 2026-05-20 from post phase-1.1.B step-4
// floor of 117.3 KB; create still on the 2026-05-19 baseline; landing
// re-baselined 2026-07-02 from the 79.5 KB floor after the docs-link +
// "Built on Stellar" header/footer additions):
//   initialGz: floor * 1.05, nearest 1 KB. Per-route perception gate.
//   totalGz:   floor * 1.15, nearest 50 KB. Patological bloat tripwire.
//
// To ratchet down after an improvement: re-measure, re-derive, drop the
// numbers below. To raise after an authorized feature add: justify in the
// PR description that updates this file.

import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, basename, join } from 'node:path';

const KB = 1024;

const BUDGETS = {
    landing: { initialGz: 83 * KB, totalGz: 100 * KB },
    claim: { initialGz: 123 * KB, totalGz: 13250 * KB },
    create: { initialGz: 456 * KB, totalGz: 6350 * KB },
    // airdrop-create: first client landing of the keccak Merkle bundle (D7).
    // Lean — stellar-sdk stays off every route's eager closure (lazy-imported in
    // the deploy step). Floor 2026-06-15: initial 79.7 KB, total 393.4 KB.
    'airdrop-create': { initialGz: 84 * KB, totalGz: 450 * KB },
    // airdrop-claim: a single mobile-first claim screen. stellar-sdk stays OFF
    // the link-open paint — the proof check (merkle pulls stellar-sdk) and the
    // on-chain reads/claim are both dynamic-imported on wallet-connect, so the
    // load/find/status path is stellar-sdk-free. Floor 2026-06-15: initial
    // 76.7 KB, total 365.4 KB.
    'airdrop-claim': { initialGz: 81 * KB, totalGz: 400 * KB },
};

const WEB_ROOT = resolve(import.meta.dirname, '..');

function appPaths(app) {
    const clientRoot = resolve(WEB_ROOT, 'apps', app, '.svelte-kit/output/client');
    return {
        clientRoot,
        manifestPath: resolve(clientRoot, '.vite/manifest.json'),
        immutableRoot: resolve(clientRoot, '_app/immutable'),
    };
}

function loadManifest(app) {
    const { manifestPath } = appPaths(app);
    if (!existsSync(manifestPath)) {
        throw new Error(
            `Missing manifest for ${app}: ${manifestPath}\nRun \`pnpm build:${app}\` first.`,
        );
    }
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

function sizesFor(app, file) {
    const { clientRoot } = appPaths(app);
    const path = resolve(clientRoot, file);
    const raw = statSync(path).size;
    const gz = gzipSync(readFileSync(path)).length;
    return { raw, gz };
}

function findEntry(manifest, predicate) {
    return Object.entries(manifest).find(([, v]) => predicate(v))?.[1];
}

function findChunk(manifest, key) {
    return Object.values(manifest).find((v) => '_' + basename(v.file) === key);
}

function closure(manifest, rootEntries) {
    const eagerFiles = new Set();
    const eagerCss = new Set();
    const visited = new Set();
    function walk(entry) {
        if (!entry || visited.has(entry.file)) return;
        visited.add(entry.file);
        eagerFiles.add(entry.file);
        for (const c of entry.css ?? []) eagerCss.add(c);
        for (const key of entry.imports ?? []) {
            const child = findChunk(manifest, key);
            if (child) walk(child);
        }
    }
    for (const e of rootEntries) walk(e);
    return { eagerFiles, eagerCss };
}

function worstRouteInitial(app) {
    const manifest = loadManifest(app);
    const startEntry = findEntry(manifest, (v) => v.name === 'entry/start');
    const appEntry = findEntry(manifest, (v) => v.name === 'entry/app');
    const rootLayoutNode = findEntry(manifest, (v) => v.name === 'nodes/0');
    const eagerBase = [startEntry, appEntry, rootLayoutNode].filter(Boolean);
    const routeNodes = Object.values(manifest).filter((v) => v.name?.startsWith('nodes/'));

    let worst = { node: null, gz: 0 };
    for (const node of routeNodes) {
        const { eagerFiles, eagerCss } = closure(manifest, [...eagerBase, node]);
        let gz = 0;
        for (const f of eagerFiles) gz += sizesFor(app, f).gz;
        for (const f of eagerCss) gz += sizesFor(app, f).gz;
        if (gz > worst.gz) worst = { node: node.name, gz };
    }
    return worst;
}

function totalShipGz(app) {
    const { immutableRoot } = appPaths(app);
    if (!existsSync(immutableRoot)) {
        throw new Error(
            `Missing immutable assets for ${app}: ${immutableRoot}\nRun \`pnpm build:${app}\` first.`,
        );
    }
    function walk(dir) {
        const out = [];
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) out.push(...walk(p));
            else out.push(p);
        }
        return out;
    }
    let gz = 0;
    for (const f of walk(immutableRoot)) gz += gzipSync(readFileSync(f)).length;
    return gz;
}

function fmtKB(n) {
    return (n / KB).toFixed(1);
}

function pct(measured, budget) {
    return ((measured / budget) * 100).toFixed(1) + '%';
}

const apps = Object.keys(BUDGETS);
const rows = [];
let failed = false;

for (const app of apps) {
    const budget = BUDGETS[app];
    const initial = worstRouteInitial(app);
    const total = totalShipGz(app);
    const initialOk = initial.gz <= budget.initialGz;
    const totalOk = total <= budget.totalGz;
    if (!initialOk || !totalOk) failed = true;
    rows.push({
        app,
        initialNode: initial.node,
        initialMeasured: initial.gz,
        initialBudget: budget.initialGz,
        initialOk,
        totalMeasured: total,
        totalBudget: budget.totalGz,
        totalOk,
    });
}

console.log('Bundle budget check (gz)\n');
const header = ['App', 'Metric', 'Measured', 'Budget', 'Headroom', 'Status'];
const widths = [10, 22, 12, 12, 10, 6];
function row(cells) {
    return cells.map((c, i) => String(c).padEnd(widths[i])).join(' ');
}
console.log(row(header));
console.log(row(widths.map((w) => '-'.repeat(w))));
for (const r of rows) {
    console.log(
        row([
            r.app,
            `initial (${r.initialNode})`,
            fmtKB(r.initialMeasured) + ' KB',
            fmtKB(r.initialBudget) + ' KB',
            pct(r.initialMeasured, r.initialBudget),
            r.initialOk ? 'ok' : 'FAIL',
        ]),
    );
    console.log(
        row([
            '',
            'total ship',
            fmtKB(r.totalMeasured) + ' KB',
            fmtKB(r.totalBudget) + ' KB',
            pct(r.totalMeasured, r.totalBudget),
            r.totalOk ? 'ok' : 'FAIL',
        ]),
    );
}

if (failed) {
    console.error(
        '\nBudget regression. Either revert the offending change or, if the increase is intentional and authorized, update the budget in web/scripts/check-bundle-budget.mjs and explain in the PR description.',
    );
    process.exit(1);
}
console.log('\nAll budgets within limits.');
