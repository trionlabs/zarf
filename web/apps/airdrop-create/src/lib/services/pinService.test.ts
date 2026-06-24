import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Replace the wallet signer so no Freighter / browser API is touched.
vi.mock('@zarf/core/contracts/wallet', () => ({
    signMessage: vi.fn(async (message: string) => `SIG(${message})`),
}));

import { pinAirdropClaimList } from './pinService';
import { signMessage } from '@zarf/core/contracts/wallet';
import { serializeClaimList } from '@zarf/core/merkle';
import type { AirdropClaimListJson } from '@zarf/core/merkle';
import type { StellarAddress } from '@zarf/core/types';

const OWNER = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4' as StellarAddress;
const DOC: AirdropClaimListJson = {
    v: 1,
    network: 'testnet',
    airdrop: 'CAIRDROP00000000000000000000000000000000000000000000000A',
    token: 'CTOKEN0000000000000000000000000000000000000000000000000A',
    root: `0x${'ab'.repeat(32)}`,
    format: {
        hash: 'keccak256',
        leaf: '0x00|index_be32|claimant_xdr|amount_be128',
        node: '0x01|sorted(L,R)',
        leafBinding: 'none',
    },
    claims: [{ address: OWNER, amount: '100', proof: [] }],
};

describe('pinAirdropClaimList', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_PIN_PROXY_URL', 'https://pin.example/');
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('POSTs the serialized doc to /pin-airdrop with X-Zarf-* auth bound to root', async () => {
        const fetchMock = vi.fn(
            async (_url: string, _init: RequestInit) =>
                new Response(JSON.stringify({ cid: 'bafyCID' }), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const { cid } = await pinAirdropClaimList(DOC, { owner: OWNER });
        expect(cid).toBe('bafyCID');
        expect(fetchMock).toHaveBeenCalledOnce();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://pin.example/pin-airdrop'); // not the vesting /pin
        expect(init.method).toBe('POST');
        expect(init.body).toBe(serializeClaimList(DOC));

        const headers = init.headers as Record<string, string>;
        expect(headers['X-Zarf-Owner']).toBe(OWNER);
        expect(headers['X-Zarf-Body-SHA256']).toMatch(/^[0-9a-f]{64}$/);
        expect(headers['X-Zarf-Signature']).toContain('SIG(');

        // The signed message binds the claim-list root (label stays `merkleRoot:`).
        const signedMessage = vi.mocked(signMessage).mock.calls[0][0];
        expect(signedMessage).toContain(`merkleRoot:${DOC.root}`);
        expect(signedMessage).toContain(`owner:${OWNER}`);
    });

    it('retries once on transient network failure', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ cid: 'bafyRETRY' }), { status: 200 }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const { cid } = await pinAirdropClaimList(DOC, { owner: OWNER });
        expect(cid).toBe('bafyRETRY');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry a deterministic 4xx (no duplicate signed POST)', async () => {
        const fetchMock = vi.fn(async () => new Response('bad signature', { status: 401 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(pinAirdropClaimList(DOC, { owner: OWNER })).rejects.toThrow(/401/);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('retries a transient 5xx (proxy 502 = Pinata outage; pinning is idempotent)', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: 'pinata_unreachable' }), { status: 502 }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ cid: 'bafy502' }), { status: 200 }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const { cid } = await pinAirdropClaimList(DOC, { owner: OWNER });
        expect(cid).toBe('bafy502');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
