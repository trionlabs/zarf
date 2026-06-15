import { describe, it, expect, vi } from 'vitest';
import type { StellarAddress, StellarContractId } from '@zarf/core/types';

// `predictAirdropAddress` is mocked (no network); `buildClaimList`/`parseTokenAmount`
// stay real so the test exercises the actual tree + amount conversion.
const { PREDICTED } = vi.hoisted(() => ({
    PREDICTED: 'CCPREDICTEDADDRESS0000000000000000000000000000000000000A',
}));
vi.mock('@zarf/core/contracts', () => ({
    predictAirdropAddress: vi.fn(async () => PREDICTED),
}));
vi.mock('./pinService', () => ({
    pinAirdropClaimList: vi.fn(async () => ({ cid: 'bafyTEST' })),
}));

import { prepareCampaign, buildMerkleRows, sumBaseUnits } from './airdropDeploy';
import { pinAirdropClaimList } from './pinService';

// Real, checksum-valid strkeys — these go through Address.fromString in leafHash.
const REC_G = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4' as StellarAddress;
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' as StellarContractId;

describe('buildMerkleRows / sumBaseUnits', () => {
    it('uppercases addresses and converts UI amounts to i128 base units', () => {
        const rows = buildMerkleRows([{ address: REC_G.toLowerCase(), amount: 1.5 }], 7);
        expect(rows[0].address).toBe(REC_G); // re-uppercased (load-bearing)
        expect(rows[0].amount).toBe('15000000'); // 1.5 * 10^7
    });

    it('sums base units exactly (no IEEE-754 drift)', () => {
        const rows = buildMerkleRows(
            [
                { address: REC_G, amount: 1 },
                { address: TOKEN, amount: 2 },
            ],
            7,
        );
        expect(sumBaseUnits(rows)).toBe('30000000');
    });
});

describe('prepareCampaign', () => {
    it('predicts → builds (leafBinding none) → pins, in order; embeds predicted address', async () => {
        const res = await prepareCampaign({
            factoryAddress: TOKEN, // value irrelevant (predict is mocked)
            owner: REC_G,
            token: TOKEN,
            network: 'testnet',
            salt: `0x${'00'.repeat(32)}`,
            recipients: [
                { address: REC_G, amount: 1 },
                { address: TOKEN, amount: 2 },
            ],
            decimals: 7,
        });

        expect(res.predictedAddress).toBe(PREDICTED);
        expect(res.metadataCid).toBe('bafyTEST');
        expect(res.total).toBe('30000000');
        expect(res.merkleRoot).toMatch(/^0x[0-9a-f]{64}$/);

        // The pinned doc embeds the predicted address and the airdrop schema.
        const doc = vi.mocked(pinAirdropClaimList).mock.calls[0][0];
        expect(doc.airdrop).toBe(PREDICTED);
        expect(doc.token).toBe(TOKEN);
        expect(doc.network).toBe('testnet');
        expect(doc.format.leafBinding).toBe('none');
        expect(doc.root).toBe(res.merkleRoot);
        expect(doc.claims).toHaveLength(2);
        expect(doc.claims[0].amount).toBe('10000000');
    });
});
