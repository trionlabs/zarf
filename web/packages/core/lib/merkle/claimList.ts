/**
 * Airdrop claim-list document builder. Emits the public JSON pinned to IPFS
 * (doc 02 §6 / doc 09 §6).
 *
 * Determinism is load-bearing: the same input MUST produce byte-identical JSON
 * (re-pinning yields the same CID), so fields are written in a fixed order —
 * the same discipline as `domain/claimListBuilder`. This is a DISTINCT schema
 * from that ZK builder (`v/network/airdrop/token/root/format/claims`).
 *
 * @module merkle/claimList
 */

import type { AirdropClaimListJson, ClaimListFormat, ClaimListMeta, Row } from './types';
import { buildTree } from './tree';

/** The frozen hash-contract pin embedded in every claim-list (doc 09 §6). */
const FORMAT: ClaimListFormat = {
    hash: 'keccak256',
    leaf: '0x00|index_be32|claimant_xdr|amount_be128',
    node: '0x01|sorted(L,R)',
    leafBinding: 'none',
};

/**
 * Build the claim-list document for `rows` under `meta`. `claims[i].index` is
 * implicit (= array order) and the proofs come from the same tree as `root`.
 */
export function buildClaimList(meta: ClaimListMeta, rows: Row[]): AirdropClaimListJson {
    if (rows.length === 0) throw new Error('buildClaimList: no rows');
    for (const r of rows) {
        if (BigInt(r.amount) <= 0n) {
            throw new Error(
                `buildClaimList: amount must be > 0 (got ${r.amount} for ${r.address})`,
            );
        }
    }

    const tree = buildTree(rows);

    return {
        v: 1,
        network: meta.network,
        airdrop: meta.airdrop,
        token: meta.token,
        root: tree.root,
        format: { ...FORMAT, leafBinding: meta.leafBinding ?? 'none' },
        claims: rows.map((r, i) => ({
            address: r.address,
            amount: r.amount,
            proof: tree.proofs[i],
        })),
    };
}

/**
 * Stable serialization: keys are written in a fixed order so two builds of the
 * same logical content produce byte-identical output (and the same IPFS CID).
 * Mirrors `domain/claimListBuilder.serializeClaimList`.
 */
export function serializeClaimList(doc: AirdropClaimListJson): string {
    return JSON.stringify({
        v: doc.v,
        network: doc.network,
        airdrop: doc.airdrop,
        token: doc.token,
        root: doc.root,
        format: {
            hash: doc.format.hash,
            leaf: doc.format.leaf,
            node: doc.format.node,
            leafBinding: doc.format.leafBinding,
        },
        claims: doc.claims.map((c) => ({ address: c.address, amount: c.amount, proof: c.proof })),
    });
}
