import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import worker, { buildCorsHeaders } from './index';

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

let reqSeq = 0;
function post(path: string, headers: Record<string, string>, body: string): Request {
    // Give each request a distinct client IP unless the caller pinned one, so
    // the per-IP pin rate limit never makes independent tests collide.
    let h = headers;
    if (!('CF-Connecting-IP' in headers)) {
        const n = reqSeq++;
        h = { ...headers, 'CF-Connecting-IP': `10.42.${(n >> 8) & 255}.${n & 255}` };
    }
    return new Request(`https://proxy.example${path}`, { method: 'POST', headers: h, body });
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

    it('rejects each malformed claim-list field with its specific reason (pre-auth 400)', async () => {
        const claimsOf = (d: Record<string, unknown>) => d.claims as Array<Record<string, unknown>>;
        const cases: Array<[string, (d: Record<string, unknown>) => void]> = [
            ['invalid_version', (d) => void (d.v = 2)],
            ['invalid_network', (d) => void (d.network = 'mainnetx')],
            ['missing_airdrop', (d) => void (d.airdrop = '')],
            ['missing_token', (d) => void (d.token = '')],
            ['missing_format', (d) => void delete d.format],
            ['missing_or_empty_claims', (d) => void (d.claims = [])],
            ['invalid_claim', (d) => void (d.claims = [null])],
            ['invalid_claim_address', (d) => void (claimsOf(d)[0].address = '')],
            ['invalid_claim_amount', (d) => void (claimsOf(d)[0].amount = '1.5')],
            ['invalid_claim_proof', (d) => void (claimsOf(d)[0].proof = 'nope')],
            ['invalid_proof_node', (d) => void (claimsOf(d)[0].proof = ['zz'])],
        ];
        for (const [reason, mutate] of cases) {
            const doc = airdropDoc(ROOT);
            mutate(doc);
            const res = await worker.fetch(
                post('/pin-airdrop', { 'Content-Type': 'application/json' }, JSON.stringify(doc)),
                ENV,
            );
            expect(res.status, reason).toBe(400);
            const out = (await res.json()) as PinResult;
            expect(out.error, reason).toBe('invalid_claim_list');
            expect(out.reason, reason).toBe(reason);
        }
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

describe('pin-proxy abuse caps (F2)', () => {
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

    it('rate-limits a single IP after 20 pin attempts (429 + Retry-After)', async () => {
        const ip = '203.0.113.7';
        const hdrs = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
        // The first 20 pass the rate gate (then 400 on the empty body) — never 429.
        for (let i = 0; i < 20; i += 1) {
            const res = await worker.fetch(post('/pin', hdrs, '{}'), ENV);
            expect(res.status, `attempt ${i + 1}`).not.toBe(429);
        }
        const limited = await worker.fetch(post('/pin', hdrs, '{}'), ENV);
        expect(limited.status).toBe(429);
        expect(((await limited.json()) as PinResult).error).toBe('rate_limited');
        expect(limited.headers.get('Retry-After')).toBe('60');
    });

    it('does not rate-limit a different, unseen IP', async () => {
        const res = await worker.fetch(
            post(
                '/pin',
                { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.8' },
                '{}',
            ),
            ENV,
        );
        expect(res.status).not.toBe(429);
    });

    it('rejects a vesting claim-list exceeding MAX_CLAIM_ENTRIES (pre-auth 400)', async () => {
        const env = { ...ENV, MAX_CLAIM_ENTRIES: '1' };
        const doc = {
            merkleRoot: ROOT,
            leaves: [`0x${'ef'.repeat(32)}`, `0x${'ab'.repeat(32)}`],
            schedule: { cliff: 0 },
        };
        const res = await worker.fetch(
            post('/pin', { 'Content-Type': 'application/json' }, JSON.stringify(doc)),
            env,
        );
        expect(res.status).toBe(400);
        const out = (await res.json()) as PinResult;
        expect(out.error).toBe('invalid_claim_list');
        expect(out.reason).toBe('too_many_leaves');
    });

    it('rejects an airdrop claim-list exceeding MAX_CLAIM_ENTRIES (pre-auth 400)', async () => {
        const env = { ...ENV, MAX_CLAIM_ENTRIES: '1' };
        const doc = airdropDoc(ROOT);
        (doc.claims as Array<Record<string, unknown>>).push({
            address: 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4',
            amount: '5',
            proof: [PROOF_NODE],
        });
        const res = await worker.fetch(
            post('/pin-airdrop', { 'Content-Type': 'application/json' }, JSON.stringify(doc)),
            env,
        );
        expect(res.status).toBe(400);
        expect(((await res.json()) as PinResult).reason).toBe('too_many_claims');
    });
});

describe('buildCorsHeaders (fail-closed — write worker must never fail open)', () => {
    const env = { ALLOWED_ORIGINS: 'https://a.example,https://airdrop.zarf.to' } as Parameters<
        typeof buildCorsHeaders
    >[1];

    it('echoes an allow-listed origin', () => {
        expect(buildCorsHeaders('https://a.example', env)['Access-Control-Allow-Origin']).toBe(
            'https://a.example',
        );
        expect(
            buildCorsHeaders('https://airdrop.zarf.to', env)['Access-Control-Allow-Origin'],
        ).toBe('https://airdrop.zarf.to');
    });

    it('emits NO Access-Control-Allow-Origin for a non-allow-listed origin (no allowed[0] echo)', () => {
        expect(
            buildCorsHeaders('https://evil.example', env)['Access-Control-Allow-Origin'],
        ).toBeUndefined();
    });

    it('emits NO Access-Control-Allow-Origin when Origin is absent', () => {
        expect(buildCorsHeaders(null, env)['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('never emits a literal "*" when ALLOWED_ORIGINS is unset', () => {
        const headers = buildCorsHeaders(
            'https://evil.example',
            {} as Parameters<typeof buildCorsHeaders>[1],
        );
        expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
});
