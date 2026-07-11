import { describe, it, expect } from 'vitest';
import { Address } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { buildCreateAirdropArgs, type CreateAirdropParams } from '../contracts';

// A real testnet G-address (owner) and the XLM testnet SAC C-address (token).
const OWNER = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const ROOT = ('0x' + '11'.repeat(32)) as `0x${string}`;
const SALT = ('0x' + '22'.repeat(32)) as `0x${string}`;

const params: CreateAirdropParams = {
    factoryAddress: TOKEN, // unused by buildCreateAirdropArgs; any C-address
    owner: OWNER,
    token: TOKEN,
    merkleRoot: ROOT,
    total: 84_200n,
    deadline: 1_756_000_000,
    locked: true,
    recipientCount: 3,
    salt: SALT,
    metadataCid: 'bafyTESTcid',
};

describe('buildCreateAirdropArgs', () => {
    it('emits the 9 args in the exact 02 §2.5 order and ScVal types', () => {
        const args = buildCreateAirdropArgs(params);
        // owner, token, merkle_root, total, deadline, locked, recipient_count, salt, metadata_cid
        expect(args.map((a) => a.switch().name)).toEqual([
            'scvAddress',
            'scvAddress',
            'scvBytes',
            'scvI128',
            'scvU64',
            'scvBool',
            'scvU32',
            'scvBytes',
            'scvString',
        ]);
    });

    it('encodes each field faithfully (owner->admin first, 32-byte root/salt, locked bool)', () => {
        const args = buildCreateAirdropArgs(params);
        expect(Address.fromScVal(args[0]).toString()).toBe(OWNER);
        expect(Address.fromScVal(args[1]).toString()).toBe(TOKEN);
        expect(Buffer.from(args[2].bytes()).toString('hex')).toBe('11'.repeat(32));
        expect(args[5].b()).toBe(true);
        expect(args[6].u32()).toBe(3);
        expect(Buffer.from(args[7].bytes()).toString('hex')).toBe('22'.repeat(32));
        expect(args[8].str().toString()).toBe('bafyTESTcid');
    });
});
