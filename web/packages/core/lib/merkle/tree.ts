/**
 * Merkle tree construction + proof verification for the airdrop.
 *
 * Sorted-pair tree with odd-node promotion; proofs are leaf→root sibling lists
 * (no direction bit). This is a 1:1 port of the Rust `build_tree`
 * (`contracts/soroban/zarf/airdrop/tests`), pinned byte-for-byte against the
 * shared fixture (doc 09 §4, doc 06 §15).
 *
 * @module merkle/tree
 */

import type { Row, Tree } from './types';
import { compareBytes, fromHex, hashNodeBytes, leafBytes, toHex } from './hash';

/** `0x`-prefixed leaf hash for one row at `index` (doc 09 §3). */
export function leafHash(index: number, address: string, amount: string): string {
    return toHex(leafBytes(index, address, BigInt(amount)));
}

/**
 * Build the tree over `rows` (index = array position). Returns root, leaves and
 * per-row proofs, all `0x`-prefixed lowercase hex (doc 09 §4/§8).
 */
export function buildTree(rows: Row[]): Tree {
    if (rows.length === 0) throw new Error('buildTree: no rows');

    const leaves = rows.map((r, i) => leafBytes(i, r.address, BigInt(r.amount)));
    const n = leaves.length;
    const proofs: Uint8Array[][] = Array.from({ length: n }, () => []);

    if (n === 1) {
        return { root: toHex(leaves[0]), leaves: [toHex(leaves[0])], proofs: [[]] };
    }

    let level = leaves;
    // positions[orig] = current index of original leaf `orig` within `level`.
    let positions = Array.from({ length: n }, (_, i) => i);

    while (level.length > 1) {
        const next: Uint8Array[] = [];
        for (let i = 0; i < level.length; i += 2) {
            if (i + 1 < level.length) {
                for (let orig = 0; orig < n; orig++) {
                    if (positions[orig] === i) proofs[orig].push(level[i + 1]);
                    else if (positions[orig] === i + 1) proofs[orig].push(level[i]);
                }
                next.push(hashNodeBytes(level[i], level[i + 1]));
            } else {
                next.push(level[i]); // lone node promoted, no sibling added
            }
        }
        positions = positions.map((p) => Math.floor(p / 2));
        level = next;
    }

    return {
        root: toHex(level[0]),
        leaves: leaves.map(toHex),
        proofs: proofs.map((p) => p.map(toHex)),
    };
}

/** Verify `proof` (leaf→root siblings) reproduces `root` from `leaf` (doc 09 §4). */
export function verifyProof(root: string, leaf: string, proof: string[]): boolean {
    let computed = fromHex(leaf);
    for (const sib of proof) computed = hashNodeBytes(computed, fromHex(sib));
    return compareBytes(computed, fromHex(root)) === 0;
}
