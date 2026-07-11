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
    it('emits the wallet campaign args in the exact create_campaign order and ScVal types', () => {
        const args = buildCreateAirdropArgs(params);
        expect(args.map((a) => a.switch().name)).toEqual([
            'scvAddress',
            'scvAddress',
            'scvBytes',
            'scvU32',
            'scvU32',
            'scvU32',
            'scvString',
            'scvString',
            'scvBytes',
            'scvBytes',
            'scvU32',
            'scvI128',
            'scvU64',
            'scvString',
            'scvU32',
        ]);
    });

    it('encodes each field faithfully (owner->admin first, wallet/immediate modes)', () => {
        const args = buildCreateAirdropArgs(params);
        expect(Address.fromScVal(args[0]).toString()).toBe(OWNER);
        expect(Address.fromScVal(args[1]).toString()).toBe(TOKEN);
        expect(Buffer.from(args[2].bytes()).toString('hex')).toBe('22'.repeat(32));
        expect(args[3].u32()).toBe(1); // wallet authorization
        expect(args[4].u32()).toBe(1); // immediate schedule
        expect(args[5].u32()).toBe(1); // reclaim after deadline
        expect(args[6].str().toString()).toBe('');
        expect(args[7].str().toString()).toBe('');
        expect(Buffer.from(args[8].bytes()).toString('hex')).toBe('11'.repeat(32));
        expect(Buffer.from(args[9].bytes()).toString('hex')).toBe('00'.repeat(32));
        expect(args[10].u32()).toBe(3);
        expect(args[12].u64().toString()).toBe('1756000000');
        expect(args[13].str().toString()).toBe('bafyTESTcid');
        expect(args[14].u32()).toBe(1); // atomic funding
    });
});
