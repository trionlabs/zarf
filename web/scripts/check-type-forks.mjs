#!/usr/bin/env node
/**
 * Type-fork guard: fails CI if any of the canonical domain types are redeclared
 * outside `packages/core/lib/`.
 *
 * Domain types live in `@zarf/core` and apps/UI re-export from there. Any new
 * `export interface MerkleClaim` (etc.) elsewhere is the bug we just spent
 * hours killing — fail loud instead of letting it drift again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CANONICAL_DIR = join(ROOT, 'packages', 'core', 'lib');

const FORKED_TYPES = [
    'MerkleClaim',
    'MerkleProof',
    'MerkleTreeData',
    'WhitelistEntry',
    'OAuthState',
];

const SKIP_DIRS = new Set([
    'node_modules',
    '.svelte-kit',
    '.wrangler',
    'dist',
    'build',
    '.git',
]);

const TYPE_DECL_RE = new RegExp(
    `^\\s*export\\s+(?:interface|type)\\s+(${FORKED_TYPES.join('|')})\\b`,
    'm',
);

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) yield* walk(full);
        else if (/\.(ts|svelte)$/.test(entry)) yield full;
    }
}

const offenders = [];
for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    if (rel.startsWith('packages' + sep + 'core' + sep + 'lib')) continue;
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(
            new RegExp(
                `^\\s*export\\s+(?:interface|type)\\s+(${FORKED_TYPES.join('|')})\\b`,
            ),
        );
        if (m) offenders.push(`${rel}:${i + 1}: ${m[1]}`);
    }
}

if (offenders.length > 0) {
    console.error(
        '\n❌ Forked domain types detected. These types must live in @zarf/core only:\n',
    );
    for (const o of offenders) console.error('   ' + o);
    console.error(
        '\n   Move the declaration into packages/core/lib/types.ts and re-export it from the offending file.\n',
    );
    process.exit(1);
}

console.log(
    `✓ No forked declarations of ${FORKED_TYPES.join(', ')} outside @zarf/core.`,
);
