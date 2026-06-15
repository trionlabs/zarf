/**
 * Differential + unit tests for `@zarf/core/merkle`.
 *
 * The differential block is load-bearing: it consumes the byte-copy of the
 * Rust-generated fixture (real host keccak256 + real `Address::to_xdr`) and
 * INDEPENDENTLY recomputes every leaf, root and proof, so any JS↔Rust drift
 * fails here at commit time (doc 06 §15.3). The fixture is the frozen expected
 * output — the JS side never trusts it blindly.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildClaimList, buildTree, leafHash, serializeClaimList, verifyProof } from '../index';
import { addressXdr } from '../hash';
import type { Row } from '../types';

interface FixtureCase {
    index: number;
    address: string;
    amount: string;
    leaf: string;
    proof: string[];
}
interface FixtureTree {
    name: string;
    recipientCount: number;
    root: string;
    cases: FixtureCase[];
}
interface Fixture {
    schemaVersion: number;
    format: { hash: string; leaf: string; node: string; fieldReduction: string };
    trees: FixtureTree[];
}

const vectors = JSON.parse(
    readFileSync(new URL('./merkle-vectors.json', import.meta.url), 'utf8'),
) as Fixture;

const HEX32 = /^0x[0-9a-f]{64}$/;

// A real G… account and a C… contract address (both drawn from the fixture),
// used for the XDR-envelope length checks.
const G_ADDR = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';
const C_ADDR = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

describe('merkle/hash — address XDR envelope (doc 09 §3.3)', () => {
    it('encodes a G… account as a 44-byte ScVal', () => {
        expect(addressXdr(G_ADDR).length).toBe(44);
    });
    it('encodes a C… contract as a 40-byte ScVal', () => {
        expect(addressXdr(C_ADDR).length).toBe(40);
    });
    it('rejects non-account/contract addresses (muxed M…, garbage)', () => {
        expect(() => addressXdr('not-a-strkey')).toThrow();
        expect(() =>
            addressXdr('MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAAAJLK'),
        ).toThrow();
    });
});

describe('merkle differential vs Rust fixture (doc 06 §15)', () => {
    it('pins keccak256 with NO field reduction', () => {
        expect(vectors.format.hash).toBe('keccak256');
        expect(vectors.format.fieldReduction).toBe('NONE');
    });

    for (const tree of vectors.trees) {
        describe(`tree "${tree.name}" (${tree.recipientCount} recipients)`, () => {
            const ordered = [...tree.cases].sort((a, b) => a.index - b.index);
            const rows: Row[] = ordered.map((c) => ({ address: c.address, amount: c.amount }));

            it('independently recomputes each leaf == fixture leaf', () => {
                for (const c of tree.cases) {
                    expect(leafHash(c.index, c.address, c.amount)).toBe(c.leaf);
                }
            });

            it('buildTree reproduces the frozen root, leaves and proofs', () => {
                const built = buildTree(rows);
                expect(built.root).toBe(tree.root);
                expect(built.leaves).toHaveLength(tree.recipientCount);
                for (const c of tree.cases) {
                    expect(built.leaves[c.index]).toBe(c.leaf);
                    expect(built.proofs[c.index]).toEqual(c.proof);
                }
            });

            it('every fixture proof verifies against the root', () => {
                for (const c of tree.cases) {
                    expect(verifyProof(tree.root, c.leaf, c.proof)).toBe(true);
                }
            });
        });
    }
});

describe('buildTree / verifyProof units', () => {
    it('single leaf: root == leaf, proof []', () => {
        const t = buildTree([{ address: G_ADDR, amount: '1' }]);
        expect(t.root).toBe(t.leaves[0]);
        expect(t.proofs).toEqual([[]]);
        expect(verifyProof(t.root, t.leaves[0], [])).toBe(true);
    });

    it('all hashes are 0x-prefixed lowercase 32-byte hex', () => {
        const t = buildTree([
            { address: G_ADDR, amount: '100' },
            { address: C_ADDR, amount: '2' },
        ]);
        expect(t.root).toMatch(HEX32);
        for (const leaf of t.leaves) expect(leaf).toMatch(HEX32);
        for (const proof of t.proofs) for (const sib of proof) expect(sib).toMatch(HEX32);
    });

    it('verifyProof rejects a tampered root', () => {
        const t = buildTree([
            { address: G_ADDR, amount: '100' },
            { address: C_ADDR, amount: '2' },
        ]);
        expect(verifyProof(`0x${'00'.repeat(32)}`, t.leaves[0], t.proofs[0])).toBe(false);
    });

    it('verifyProof rejects a tampered proof sibling', () => {
        const t = buildTree([
            { address: G_ADDR, amount: '100' },
            { address: C_ADDR, amount: '2' },
        ]);
        const bad = [...t.proofs[0]];
        bad[0] = `0x${'ff'.repeat(32)}`;
        expect(verifyProof(t.root, t.leaves[0], bad)).toBe(false);
    });

    it('leafHash binds the index (position-sensitive)', () => {
        expect(leafHash(0, G_ADDR, '5')).not.toBe(leafHash(1, G_ADDR, '5'));
    });

    it('rejects an amount past i128::MAX at hash time, accepts i128::MAX', () => {
        // The pure leaf primitive guards only the i128 range (mirrors Rust's
        // guard-free `leaf`); the amount > 0 rule lives in buildClaimList + the
        // contract. 2^127 is one past i128::MAX → throws; 2^127 - 1 is fine.
        expect(() => leafHash(0, G_ADDR, (1n << 127n).toString())).toThrow();
        expect(() => leafHash(0, G_ADDR, ((1n << 127n) - 1n).toString())).not.toThrow();
    });
});

describe('buildClaimList (doc 09 §6)', () => {
    const meta = { network: 'testnet', airdrop: C_ADDR, token: C_ADDR } as const;
    const rows: Row[] = [
        { address: G_ADDR, amount: '1000000' },
        { address: C_ADDR, amount: '5' },
    ];

    it('emits the canonical shape with proofs matching buildTree', () => {
        const doc = buildClaimList(meta, rows);
        const tree = buildTree(rows);
        expect(doc.v).toBe(1);
        expect(doc.network).toBe('testnet');
        expect(doc.airdrop).toBe(meta.airdrop);
        expect(doc.token).toBe(meta.token);
        expect(doc.root).toBe(tree.root);
        expect(doc.format).toEqual({
            hash: 'keccak256',
            leaf: '0x00|index_be32|claimant_xdr|amount_be128',
            node: '0x01|sorted(L,R)',
            leafBinding: 'none',
        });
        expect(doc.claims).toHaveLength(2);
        doc.claims.forEach((c, i) => {
            expect(c.address).toBe(rows[i].address);
            expect(c.amount).toBe(rows[i].amount);
            expect(c.proof).toEqual(tree.proofs[i]);
            // index is implicit = position: the proof must verify the row's leaf.
            expect(verifyProof(doc.root, leafHash(i, c.address, c.amount), c.proof)).toBe(true);
        });
    });

    it('rejects empty rows and amount <= 0', () => {
        expect(() => buildClaimList(meta, [])).toThrow();
        expect(() => buildClaimList(meta, [{ address: G_ADDR, amount: '0' }])).toThrow();
        expect(() => buildClaimList(meta, [{ address: G_ADDR, amount: '-5' }])).toThrow();
    });

    it('serializes byte-identically across builds (CID determinism)', () => {
        expect(serializeClaimList(buildClaimList(meta, rows))).toBe(
            serializeClaimList(buildClaimList(meta, rows)),
        );
    });
});
