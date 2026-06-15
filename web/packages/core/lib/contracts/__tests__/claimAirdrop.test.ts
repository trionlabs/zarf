import { describe, it, expect } from 'vitest';
import { Address, xdr, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { buildClaimAirdropArgs, decodeAirdropConfig, type ClaimAirdropParams } from '../contracts';

// Real testnet strkeys: a G-address (claimant/admin), the XLM SAC C-address
// (token), and a C-address standing in for the airdrop instance.
const CLAIMANT = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const AIRDROP = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';

// Two distinct 32-byte sibling hashes (0x-prefixed, as @zarf/core/merkle emits).
const SIB0 = ('0x' + 'aa'.repeat(32)) as `0x${string}`;
const SIB1 = ('0x' + 'bb'.repeat(32)) as `0x${string}`;

describe('buildClaimAirdropArgs', () => {
    const params: ClaimAirdropParams = {
        airdrop: AIRDROP, // unused by the arg builder; any C-address
        index: 7,
        claimant: CLAIMANT,
        amount: 100_000n,
        proof: [SIB0, SIB1],
    };

    it('emits the 4 args in the exact 02 §3.6 order and ScVal types', () => {
        const args = buildClaimAirdropArgs(params);
        // index, claimant, amount, proof
        expect(args.map((a) => a.switch().name)).toEqual([
            'scvU32',
            'scvAddress',
            'scvI128',
            'scvVec',
        ]);
    });

    it('encodes index/claimant/amount faithfully', () => {
        const args = buildClaimAirdropArgs(params);
        expect(args[0].u32()).toBe(7);
        expect(Address.fromScVal(args[1]).toString()).toBe(CLAIMANT);
        expect(scValToNative(args[2])).toBe(100_000n);
    });

    it('encodes proof as a Vec<BytesN<32>> preserving order', () => {
        const vec = buildClaimAirdropArgs(params)[3].vec();
        expect(vec).not.toBeNull();
        expect(vec!).toHaveLength(2);
        expect(vec!.map((v) => v.switch().name)).toEqual(['scvBytes', 'scvBytes']);
        expect(Buffer.from(vec![0].bytes()).toString('hex')).toBe('aa'.repeat(32));
        expect(Buffer.from(vec![1].bytes()).toString('hex')).toBe('bb'.repeat(32));
    });

    it('rejects a malformed (non-32-byte) sibling hash', () => {
        expect(() => buildClaimAirdropArgs({ ...params, proof: ['0xdeadbeef'] })).toThrow();
    });
});

/** Build a synthetic `Config` struct ScVal (an ScMap), as the contract returns. */
function configScVal(opts: {
    admin: string;
    token: string;
    rootHex: string;
    total: bigint;
    deadline: bigint;
    locked: boolean;
}): xdr.ScVal {
    return xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('admin'),
            val: Address.fromString(opts.admin).toScVal(),
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('token'),
            val: Address.fromString(opts.token).toScVal(),
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('merkle_root'),
            val: xdr.ScVal.scvBytes(Buffer.from(opts.rootHex, 'hex')),
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('total'),
            val: nativeToScVal(opts.total, { type: 'i128' }),
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('deadline'),
            val: nativeToScVal(opts.deadline, { type: 'u64' }),
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('locked'),
            val: xdr.ScVal.scvBool(opts.locked),
        }),
    ]);
}

describe('decodeAirdropConfig', () => {
    it('decodes admin/token strkeys, 0x-root, i128 total, u64 deadline, bool locked', () => {
        const rootHex = 'cd'.repeat(32);
        const decoded = decodeAirdropConfig(
            configScVal({
                admin: CLAIMANT,
                token: TOKEN,
                rootHex,
                total: 84_200n,
                deadline: 1_756_000_000n,
                locked: true,
            }),
        );
        expect(decoded.admin).toBe(CLAIMANT);
        expect(decoded.token).toBe(TOKEN);
        expect(decoded.merkleRoot).toBe('0x' + rootHex);
        expect(decoded.total).toBe(84_200n);
        expect(decoded.deadline).toBe(1_756_000_000);
        expect(decoded.locked).toBe(true);
    });

    it('decodes the trustless mode (deadline 0, locked false, zero-ish root)', () => {
        const decoded = decodeAirdropConfig(
            configScVal({
                admin: CLAIMANT,
                token: TOKEN,
                rootHex: '00'.repeat(32),
                total: 1n,
                deadline: 0n,
                locked: false,
            }),
        );
        expect(decoded.deadline).toBe(0);
        expect(decoded.locked).toBe(false);
        expect(decoded.merkleRoot).toBe('0x' + '00'.repeat(32));
    });

    it('throws when the value is not a struct (ScMap)', () => {
        expect(() => decodeAirdropConfig(xdr.ScVal.scvU32(1))).toThrow();
    });
});
