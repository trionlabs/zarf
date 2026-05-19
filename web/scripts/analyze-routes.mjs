#!/usr/bin/env node
// One-shot baseline analyzer.
//
// Walks an app's Vite client manifest. For each route node, computes:
//   - eager closure (chunks fetched before the page becomes interactive,
//     i.e. transitive static imports of the route node + SvelteKit start/app
//     entries; modulepreload-fetched route nodes are treated as eager since
//     SvelteKit emits link[rel=modulepreload] for them at render time)
//   - lazy closure (chunks reached only via dynamicImports from the eager set)
// Reports raw bytes + gzipped bytes for both, and a flag for whether
// noir-vendor / stellar-vendor / aztec sit in eager or lazy.

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, basename } from 'node:path';

const appName = process.argv[2];
if (!appName) {
    console.error('usage: analyze-routes.mjs <landing|claim|create>');
    process.exit(2);
}

const APP_ROOT = resolve(import.meta.dirname, '..', 'apps', appName);
const CLIENT_ROOT = resolve(APP_ROOT, '.svelte-kit/output/client');
const IMMUTABLE_ROOT = resolve(CLIENT_ROOT, '_app/immutable');
const MANIFEST_PATH = resolve(CLIENT_ROOT, '.vite/manifest.json');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

// Reverse lookup: chunk file (relative to client root) -> manifest `name`.
// Used to identify vendor chunks (manualChunks-assigned names like
// "noir-vendor", "stellar-vendor", "vite-runtime") in a hash-stable way.
const fileToName = new Map();
for (const v of Object.values(manifest)) {
    if (v.file && v.name) fileToName.set(v.file, v.name);
}

// Build name -> entry table; manifest uses fully-qualified src paths as keys.
function findEntry(predicate) {
    return Object.entries(manifest).find(([, v]) => predicate(v))?.[1];
}
function findChunk(key) {
    // `imports` and `dynamicImports` entries are written as "_HASH.js"; match
    // against `file` basename. Manifest keys themselves are full source paths,
    // not the "_HASH.js" form, so we scan values.
    return Object.values(manifest).find(
        (v) => v.file === `_app/immutable/chunks/${key.replace(/^_/, '')}` ||
               '_' + basename(v.file) === key,
    );
}

const startEntry = findEntry((v) => v.name === 'entry/start');
const appEntry = findEntry((v) => v.name === 'entry/app');

function sizesFor(file) {
    const path = resolve(CLIENT_ROOT, file);
    const raw = statSync(path).size;
    const gz = gzipSync(readFileSync(path)).length;
    return { raw, gz };
}

// Walk closure. `lazyFromSrc[file]` tells you which dynamicImports were
// available so we can record per-route lazy chunks separately.
function closure(rootEntries) {
    const eagerFiles = new Set();
    const eagerCss = new Set();
    const lazyEntries = new Set();
    const visited = new Set();

    function walk(entry) {
        if (!entry || visited.has(entry.file)) return;
        visited.add(entry.file);
        eagerFiles.add(entry.file);
        for (const c of entry.css ?? []) eagerCss.add(c);
        for (const key of entry.imports ?? []) {
            const child = findChunk(key);
            if (child) walk(child);
        }
        for (const key of entry.dynamicImports ?? []) {
            lazyEntries.add(key);
        }
    }
    for (const e of rootEntries) walk(e);

    return { eagerFiles, eagerCss, lazyEntries };
}

function totalSizes(files) {
    let raw = 0, gz = 0;
    for (const f of files) {
        const { raw: r, gz: g } = sizesFor(f);
        raw += r;
        gz += g;
    }
    return { raw, gz };
}

function fmtKB(n) {
    return (n / 1024).toFixed(1);
}

// Return the manifest-assigned name of a chunk (e.g. "noir-vendor",
// "stellar-vendor", "ui-vendor", "merkleTree", "ZenButton"). Falls back to
// basename when the chunk isn't in the manifest (rare; usually only Vite
// internal helpers without an explicit name).
//
// Hash-stable: the manifest writes the same name across rebuilds even when
// file hashes change.
function nameFor(file) {
    return fileToName.get(file) ?? basename(file);
}

const VENDOR_NAMES = new Set(['noir-vendor', 'stellar-vendor']);

// Find route nodes from manifest (entries named "nodes/N")
const routeNodes = Object.values(manifest).filter((v) => v.name?.startsWith('nodes/'));

console.log(`\n# ${appName}\n`);
console.log('## Per-route initial paint (eager static imports)\n');
console.log('Route node | Files | JS raw KB | JS gz KB | CSS raw KB | CSS gz KB');
console.log('---|---:|---:|---:|---:|---:');

const rootLayoutNode = routeNodes.find((n) => n.name === 'nodes/0');
const eagerBase = [startEntry, appEntry, rootLayoutNode].filter(Boolean);

const rowSummaries = [];
for (const node of routeNodes.sort((a, b) => a.name.localeCompare(b.name))) {
    const { eagerFiles, eagerCss, lazyEntries } = closure([...eagerBase, node]);
    const js = [...eagerFiles].filter((f) => f.endsWith('.js'));
    const cssTotals = totalSizes([...eagerCss]);
    const jsTotals = totalSizes(js);
    rowSummaries.push({
        node: node.name,
        nodeFile: node.file,
        eagerFiles: js,
        eagerCss: [...eagerCss],
        lazyEntries: [...lazyEntries],
        jsTotals,
        cssTotals,
    });
    console.log(
        `${node.name} (\`${basename(node.file)}\`) | ${js.length} | ${fmtKB(jsTotals.raw)} | ${fmtKB(jsTotals.gz)} | ${fmtKB(cssTotals.raw)} | ${fmtKB(cssTotals.gz)}`,
    );
}

console.log('\n## Vendor presence in eager closure (per route)\n');
console.log('Route node | noir-vendor? | stellar-vendor? | other ≥100 KB gz');
console.log('---|---|---|---');
for (const r of rowSummaries) {
    const vendors = new Set();
    let big = [];
    for (const f of r.eagerFiles) {
        const n = nameFor(f);
        if (VENDOR_NAMES.has(n)) vendors.add(n);
        const { gz } = sizesFor(f);
        if (gz > 100 * 1024) big.push(`${n} (${fmtKB(gz)} KB gz)`);
    }
    console.log(
        `${r.node} | ${vendors.has('noir-vendor') ? '**YES**' : 'no'} | ${vendors.has('stellar-vendor') ? '**YES**' : 'no'} | ${big.join('; ') || '—'}`,
    );
}

console.log('\n## All chunks classified\n');
console.log('Classification:');
const allFiles = readdirSync(resolve(IMMUTABLE_ROOT, 'chunks')).filter((f) => f.endsWith('.js'));
const eagerEverywhere = new Set();
for (const r of rowSummaries) for (const f of r.eagerFiles) eagerEverywhere.add(f);

const eagerEverywhereChunks = [...eagerEverywhere].map((p) => basename(p)).filter((f) => allFiles.includes(f));
const possiblyLazy = allFiles.filter((f) => !eagerEverywhereChunks.includes(f));

console.log(`- Chunks loaded by AT LEAST ONE route (eager somewhere): ${eagerEverywhereChunks.length}`);
console.log(`- Chunks NOT eager on any route (lazy-only): ${possiblyLazy.length}`);

console.log('\nLazy-only chunks (loaded via dynamicImports or never from initial paint):');
console.log('chunk | raw KB | gz KB | name');
console.log('---|---:|---:|---');
for (const f of possiblyLazy.sort((a, b) => sizesFor(`_app/immutable/chunks/${b}`).gz - sizesFor(`_app/immutable/chunks/${a}`).gz)) {
    const filePath = `_app/immutable/chunks/${f}`;
    const { raw, gz } = sizesFor(filePath);
    const n = nameFor(filePath);
    console.log(`${f} | ${fmtKB(raw)} | ${fmtKB(gz)} | ${n === basename(f) ? '' : `**${n}**`}`);
}
