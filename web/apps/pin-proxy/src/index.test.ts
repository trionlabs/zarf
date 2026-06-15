import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import worker from './index';

const SEP53_PREFIX = 'Stellar Signed Message:\n';
const PIN_AUTH_VERSION = 'zarf-pin-v1';
const ROOT = `0x${'ab'.repeat(32)}`;
const PROOF_NODE = `0x${'cd'.repeat(32)}`;
const ENV = {
    PINATA_JWT: 'test-jwt',
    ALLOWED_ORIGINS: 'https://app.example',
    MAX_BODY_BYTES: '1048576',
};

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Build the same SEP-53-prefixed signature the create/airdrop pinService sends. */
async function authHeaders(
    kp: Keypair,
    root: string,
    body: string,
): Promise<Record<string, string>> {
    const owner = kp.publicKey();
    const issuedAt = Date.now();
    const bodyHash = await sha256Hex(body);
    const message = [
        PIN_AUTH_VERSION,
        `owner:${owner}`,
        `merkleRoot:${root}`,
        `bodyHash:${bodyHash}`,
        `issuedAt:${issuedAt}`,
    ].join('\n');
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${SEP53_PREFIX}${message}`),
    );
    const signature = kp.sign(Buffer.from(digest)).toString('hex');
    return {
        'Content-Type': 'application/json',
        'X-Zarf-Owner': owner,
        'X-Zarf-Issued-At': String(issuedAt),
        'X-Zarf-Body-SHA256': bodyHash,
        'X-Zarf-Signature': signature,
    };
}

function airdropDoc(root: string): Record<string, unknown> {
    return {
        v: 1,
        network: 'testnet',
        airdrop: 'CAIRDROP00000000000000000000000000000000000000000000000A',
        token: 'CTOKEN0000000000000000000000000000000000000000000000000A',
        root,
        format: {
            hash: 'keccak256',
            leaf: '0x00|index_be32|claimant_xdr|amount_be128',
            node: '0x01|sorted(L,R)',
            leafBinding: 'none',
        },
        claims: [
            {
                address: 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4',
                amount: '100',
                proof: [PROOF_NODE],
            },
        ],
    };
}

function vestingDoc(root: string): Record<string, unknown> {
    return { merkleRoot: root, leaves: [`0x${'ef'.repeat(32)}`], schedule: { cliff: 0 } };
}

function post(path: string, headers: Record<string, string>, body: string): Request {
    return new Request(`https://proxy.example${path}`, { method: 'POST', headers, body });
}

type PinResult = { cid?: string; error?: string; reason?: string };

describe('pin-proxy /pin-airdrop (T6, additive)', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({ IpfsHash: 'bafyPINNED', PinSize: 99, Timestamp: 'now' }),
                        { status: 200 },
                    ),
            ),
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('pins a valid airdrop claim-list and returns the CID', async () => {
        const kp = Keypair.random();
        const body = JSON.stringify(airdropDoc(ROOT));
        const res = await worker.fetch(
            post('/pin-airdrop', await authHeaders(kp, ROOT, body), body),
            ENV,
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as PinResult).cid).toBe('bafyPINNED');
    });

    it('rejects a malformed 0x root before auth (400)', async () => {
        const body = JSON.stringify(airdropDoc('not-a-hex-root'));
        const res = await worker.fetch(
            post('/pin-airdrop', { 'Content-Type': 'application/json' }, body),
            ENV,
        );
        expect(res.status).toBe(400);
        const out = (await res.json()) as PinResult;
        expect(out.error).toBe('invalid_claim_list');
        expect(out.reason).toBe('missing_or_invalid_root');
    });

    it('rejects a pin with missing auth headers (401)', async () => {
        const body = JSON.stringify(airdropDoc(ROOT));
        const res = await worker.fetch(
            post('/pin-airdrop', { 'Content-Type': 'application/json' }, body),
            ENV,
        );
        expect(res.status).toBe(401);
        expect(((await res.json()) as PinResult).error).toBe('unauthorized_pin');
    });
});

describe('pin-proxy /pin (vesting route — zero touch)', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({ IpfsHash: 'bafyPINNED', PinSize: 99, Timestamp: 'now' }),
                        { status: 200 },
                    ),
            ),
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('rejects the airdrop shape (routes are separate)', async () => {
        const body = JSON.stringify(airdropDoc(ROOT));
        const res = await worker.fetch(
            post('/pin', { 'Content-Type': 'application/json' }, body),
            ENV,
        );
        expect(res.status).toBe(400);
        expect(((await res.json()) as PinResult).error).toBe('invalid_claim_list');
    });

    it('still pins a valid vesting claim-list', async () => {
        const kp = Keypair.random();
        const body = JSON.stringify(vestingDoc(ROOT));
        const res = await worker.fetch(post('/pin', await authHeaders(kp, ROOT, body), body), ENV);
        expect(res.status).toBe(200);
        expect(((await res.json()) as PinResult).cid).toBe('bafyPINNED');
    });
});
