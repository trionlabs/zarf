/**
 * Compact security tests for the wallet-airdrop Merkle protocol.
 *
 * Trees and proofs are built at runtime. One immutable root pins the external
 * byte protocol across Rust and TypeScript: address XDR, integer endianness,
 * domain tags, sorted pairs, and odd-node promotion. We deliberately avoid
 * generated fixture files and hard-coded intermediate leaves/proofs.
 */
import { describe, expect, it } from 'vitest';

import { buildClaimList, buildTree, leafHash, verifyProof } from '../index';
import { addressXdr } from '../hash';
import type { Row } from '../types';

const HEX32 = /^0x[0-9a-f]{64}$/;
const ZERO_HASH = `0x${'00'.repeat(32)}`;
const FF_HASH = `0x${'ff'.repeat(32)}`;

const G = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';
const C1 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const C2 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4';
const D3 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARQG5';
const D4 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATYON';
const I128_MAX = (1n << 127n) - 1n;

const PROTOCOL_ROOT = '0x128928130e416b42c107b220dd1f97a18eb9ab1f815b3bda24ba0f878f639110';
const PROTOCOL_ROWS: Row[] = [
    { address: G, amount: '100' },
    { address: C1, amount: (I128_MAX - 106n).toString() },
    { address: C2, amount: '3' },
    { address: D3, amount: '2' },
    { address: D4, amount: '1' },
];

describe('Merkle protocol compatibility', () => {
    it('uses the Soroban address XDR envelope and rejects unsupported addresses', () => {
        expect(addressXdr(G).length).toBe(44);
        expect(addressXdr(C1).length).toBe(40);
        expect(() => addressXdr('not-a-strkey')).toThrow();
        expect(() =>
            addressXdr('MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAAAJLK'),
        ).toThrow();
    });

    it('matches the protocol root and verifies every runtime-built proof', () => {
        const tree = buildTree(PROTOCOL_ROWS);
        expect(tree.root).toBe(PROTOCOL_ROOT);
        expect(tree.proofs.map((proof) => proof.length)).toEqual([3, 3, 3, 3, 1]);

        PROTOCOL_ROWS.forEach((row, index) => {
            expect(tree.leaves[index]).toMatch(HEX32);
            expect(tree.leaves[index]).toBe(leafHash(index, row.address, row.amount));
            expect(verifyProof(tree.root, tree.leaves[index], tree.proofs[index])).toBe(true);
            for (const sibling of tree.proofs[index]) expect(sibling).toMatch(HEX32);
        });

        const singleton = buildTree([{ address: G, amount: '1' }]);
        expect(singleton.root).toBe(singleton.leaves[0]);
        expect(singleton.proofs).toEqual([[]]);
    });

    it('rejects tampering and enforces index and i128 boundaries', () => {
        const tree = buildTree(PROTOCOL_ROWS);
        expect(verifyProof(ZERO_HASH, tree.leaves[0], tree.proofs[0])).toBe(false);

        const badProof = [...tree.proofs[0]];
        badProof[0] = FF_HASH;
        expect(verifyProof(tree.root, tree.leaves[0], badProof)).toBe(false);

        expect(leafHash(0, G, '5')).not.toBe(leafHash(1, G, '5'));
        expect(() => leafHash(0, G, (1n << 127n).toString())).toThrow();
        expect(() => leafHash(0, G, I128_MAX.toString())).not.toThrow();
    });
});

describe('claim-list construction', () => {
    const meta = { network: 'testnet', airdrop: C1, token: C1 } as const;
    const rows: Row[] = [
        { address: G, amount: '1000000' },
        { address: C1, amount: '5' },
    ];

    it('builds a canonical deterministic document with valid proofs', () => {
        const document = buildClaimList(meta, rows);
        const tree = buildTree(rows);

        expect(document).toMatchObject({
            v: 1,
            network: 'testnet',
            airdrop: meta.airdrop,
            token: meta.token,
            root: tree.root,
            format: {
                hash: 'keccak256',
                leaf: '0x00|index_be32|claimant_xdr|amount_be128',
                node: '0x01|sorted(L,R)',
                leafBinding: 'none',
            },
        });
        expect(document.claims).toHaveLength(rows.length);
        document.claims.forEach((claim, index) => {
            expect(claim).toMatchObject({
                address: rows[index].address,
                amount: rows[index].amount,
                proof: tree.proofs[index],
            });
            expect(
                verifyProof(
                    document.root,
                    leafHash(index, claim.address, claim.amount),
                    claim.proof,
                ),
            ).toBe(true);
        });
    });

    it('rejects empty rows and non-positive amounts', () => {
        expect(() => buildClaimList(meta, [])).toThrow();
        expect(() => buildClaimList(meta, [{ address: G, amount: '0' }])).toThrow();
        expect(() => buildClaimList(meta, [{ address: G, amount: '-5' }])).toThrow();
    });
});
