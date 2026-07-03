import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import worker, {
    validateClaimList,
    validateCid,
    decodeSignature,
    buildPinAuthMessage,
    sha256Hex as sha256HexExport,
    buildCorsHeaders,
} from './index';

const HEX64 = '0x' + 'a'.repeat(64);
// Large enough that the entry-count cap never trips in the unit tests below
// (the airdrop-cap tests exercise the cap explicitly via env.MAX_CLAIM_ENTRIES).
const MANY = 1_000_000;

describe('validateClaimList', () => {
    const valid = { merkleRoot: HEX64, leaves: [HEX64], schedule: {} };

    it('accepts a well-formed claim list', () => {
        expect(validateClaimList(valid, MANY)).toBeNull();
    });

    it('rejects a bad merkle root', () => {
        expect(validateClaimList({ ...valid, merkleRoot: '0xbad' }, MANY)).toBe(
            'missing_or_invalid_merkleRoot',
        );
    });

    it('rejects empty or non-hex leaves', () => {
        expect(validateClaimList({ ...valid, leaves: [] }, MANY)).toBe('missing_or_empty_leaves');
        expect(validateClaimList({ ...valid, leaves: ['nothex'] }, MANY)).toBe('invalid_leaf');
    });

    it('rejects a missing schedule and non-objects', () => {
        expect(validateClaimList({ ...valid, schedule: undefined }, MANY)).toBe('missing_schedule');
        expect(validateClaimList(null, MANY)).toBe('not_an_object');
    });

    it('rejects too many leaves above maxEntries', () => {
        expect(validateClaimList({ ...valid, leaves: [HEX64, HEX64] }, 1)).toBe('too_many_leaves');
    });
});

describe('validateCid', () => {
    it('accepts CIDv0', () => {
        const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
        expect(validateCid(cid)).toBe(cid);
    });

    it('accepts CIDv1 base32 and strips ipfs://', () => {
        const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
        expect(validateCid(`ipfs://${cid}`)).toBe(cid);
    });

    it('rejects path traversal and query/fragment', () => {
        expect(validateCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/../secret')).toBeNull();
        expect(validateCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG?x=1')).toBeNull();
        expect(validateCid('not-a-cid')).toBeNull();
    });
});

describe('decodeSignature', () => {
    it('accepts 64-byte hex (with and without 0x)', () => {
        const hex = 'ab'.repeat(64);
        expect(decodeSignature(hex)?.length).toBe(64);
        expect(decodeSignature('0x' + hex)?.length).toBe(64);
    });

    it('accepts 64-byte base64url', () => {
        const b64 = Buffer.alloc(64, 7).toString('base64url');
        expect(decodeSignature(b64)?.length).toBe(64);
    });

    it('rejects wrong-length and oversized input', () => {
        expect(decodeSignature('ab'.repeat(32))).toBeNull();
        expect(decodeSignature('z'.repeat(600))).toBeNull();
    });
});

describe('SEP-53 pin auth message + signature verification', () => {
    it('a real ed25519 signature over the canonical message verifies, a tampered body does not', async () => {
        const kp = Keypair.random();
        const owner = kp.publicKey();
        const merkleRoot = HEX64;
        const bodyHash = await sha256HexExport('{"merkleRoot":"...","leaves":[]}');
        const issuedAt = 1_700_000_000_000;

        const message = buildPinAuthMessage({ owner, merkleRoot, bodyHash, issuedAt });
        const prefixed = new TextEncoder().encode(`Stellar Signed Message:\n${message}`);
        const digest = Buffer.from(await crypto.subtle.digest('SHA-256', prefixed));
        const sig = kp.sign(digest);

        expect(kp.verify(digest, sig)).toBe(true);

        // Tampering the body hash changes the message, so the old signature fails.
        const tampered = buildPinAuthMessage({
            owner,
            merkleRoot,
            bodyHash: await sha256HexExport('different body'),
            issuedAt,
        });
        const tamperedDigest = Buffer.from(
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(`Stellar Signed Message:\n${tampered}`),
            ),
        );
        expect(kp.verify(tamperedDigest, sig)).toBe(false);
    });

    it('binds the owner: a different keypair cannot produce a passing signature', async () => {
        const a = Keypair.random();
        const b = Keypair.random();
        const message = buildPinAuthMessage({
            owner: a.publicKey(),
            merkleRoot: HEX64,
            bodyHash: await sha256HexExport('x'),
            issuedAt: 1,
        });
        const digest = Buffer.from(
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(`Stellar Signed Message:\n${message}`),
            ),
        );
        const sigByB = b.sign(digest);
        expect(a.verify(digest, sigByB)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Integration / route-level tests (airdrop M1).
// ---------------------------------------------------------------------------

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

describe('pin-proxy claim-list caps (MAX_CLAIM_ENTRIES)', () => {
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

    it('sets Vary: Origin', () => {
        expect(buildCorsHeaders('https://a.example', env)['Vary']).toBe('Origin');
    });

    it('emits NO Access-Control-Allow-Origin for a non-allow-listed origin (no allowed[0] echo)', () => {
        const headers = buildCorsHeaders('https://evil.example', env);
        expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
        expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
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

describe('pin-proxy worker CORS (integration — fail-closed via worker.fetch)', () => {
    // Guards against a regression that re-adds `|| '*'` at the call site rather
    // than in the helper — the helper-only tests above would not catch that.
    it('OPTIONS preflight from an allow-listed origin echoes the origin (204)', async () => {
        const res = await worker.fetch(
            new Request('https://proxy.example/pin', {
                method: 'OPTIONS',
                headers: { Origin: 'https://app.example' },
            }),
            ENV,
        );
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    });

    it('OPTIONS preflight from an off-list origin gets NO Access-Control-Allow-Origin', async () => {
        const res = await worker.fetch(
            new Request('https://proxy.example/pin', {
                method: 'OPTIONS',
                headers: { Origin: 'https://evil.example' },
            }),
            ENV,
        );
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('pin-proxy /ipfs read rate limit (IPFS_READ_LIMITER)', () => {
    const get = (path: string) =>
        new Request(`https://proxy.example${path}`, {
            method: 'GET',
            headers: { 'CF-Connecting-IP': '203.0.113.7' },
        });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('returns 429 when the per-IP read limiter denies — BEFORE any gateway fetch', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const env = { ...ENV, IPFS_READ_LIMITER: { limit: async () => ({ success: false }) } };
        const res = await worker.fetch(get('/ipfs/anything'), env);
        expect(res.status).toBe(429);
        expect(((await res.json()) as { error: string }).error).toBe('rate_limited');
        // The limit gate must short-circuit the 3x gateway amplification.
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('passes the limiter through to CID validation when allowed', async () => {
        const env = { ...ENV, IPFS_READ_LIMITER: { limit: async () => ({ success: true }) } };
        const res = await worker.fetch(get('/ipfs/not-a-valid-cid!'), env);
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toBe('invalid_cid');
    });

    it('degrades to no limiting when the binding is absent (route still serves)', async () => {
        const res = await worker.fetch(get('/ipfs/not-a-valid-cid!'), ENV);
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toBe('invalid_cid');
    });
});
