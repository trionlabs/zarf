#!/usr/bin/env node
/**
 * Merkle-vector sync gate.
 *
 * The airdrop Rust fixture is the single source of truth: the M1 `#[ignore]`
 * generator writes it from the real host keccak256 + real `Address::to_xdr`,
 * and the web vitest suite consumes a byte-copy. If the two drift, the contract
 * and the off-chain builder can compute different roots → every claim silently
 * fails `InvalidProof`. Compare sha256 and fail loud (doc 06 §15.5, doc 09 §7).
 *
 * Regenerate the canonical file, then re-copy it to the web path:
 *   cargo test --manifest-path contracts/soroban/zarf/airdrop/Cargo.toml \
 *     --test merkle_vectors -- --ignored
 *   cp contracts/soroban/zarf/airdrop/tests/fixtures/merkle-vectors.json \
 *      web/packages/core/lib/merkle/__tests__/merkle-vectors.json
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = new URL('..', import.meta.url).pathname;
const REPO_ROOT = join(WEB_ROOT, '..');

const CANONICAL = join(
    REPO_ROOT,
    'contracts/soroban/zarf/airdrop/tests/fixtures/merkle-vectors.json',
);
const WEB_COPY = join(WEB_ROOT, 'packages/core/lib/merkle/__tests__/merkle-vectors.json');

function sha256(path) {
    try {
        return createHash('sha256').update(readFileSync(path)).digest('hex');
    } catch (err) {
        console.error(`❌ check:merkle-vectors — cannot read ${path}\n   ${err.message}`);
        process.exit(1);
    }
}

const canonical = sha256(CANONICAL);
const webCopy = sha256(WEB_COPY);

if (canonical !== webCopy) {
    console.error(
        [
            '',
            '❌ Merkle vectors out of sync — the two copies differ:',
            '',
            `   canonical (Rust)  ${canonical}`,
            '     contracts/soroban/zarf/airdrop/tests/fixtures/merkle-vectors.json',
            `   web copy          ${webCopy}`,
            '     web/packages/core/lib/merkle/__tests__/merkle-vectors.json',
            '',
            '   The Rust fixture is the single source of truth. Re-copy it (do NOT hand-edit',
            '   the web copy):',
            '     cp contracts/soroban/zarf/airdrop/tests/fixtures/merkle-vectors.json \\',
            '        web/packages/core/lib/merkle/__tests__/merkle-vectors.json',
            '',
        ].join('\n'),
    );
    process.exit(1);
}

console.log(`✓ Merkle vectors in sync (sha256 ${canonical.slice(0, 16)}…).`);
