import { describe, expect, it } from 'vitest';
import worker, {
    jwkModulusToLimbs,
    hashLimbs,
    parseBoolean,
    parsePositiveInt,
    bigIntToFieldHex,
    hexToBytes,
    bytesToHex,
    executeRevocations,
    graceMarkerKey,
    type RevocationContext,
} from './index';

describe('jwkModulusToLimbs', () => {
    it('splits a modulus into 18 little-endian 120-bit limbs', () => {
        // n = 1 (base64url "AQ") -> limb 0 = 1, rest zero.
        const limbs = jwkModulusToLimbs('AQ');
        expect(limbs).toHaveLength(18);
        expect(BigInt(limbs[0])).toBe(1n);
        for (let i = 1; i < 18; i++) expect(BigInt(limbs[i])).toBe(0n);
    });

    it('places bits above 120 into the next limb', () => {
        // n = 2^120 -> limb0 = 0, limb1 = 1. Build the base64url for it.
        const value = 1n << 120n;
        const bytes: number[] = [];
        let v = value;
        while (v > 0n) {
            bytes.unshift(Number(v & 0xffn));
            v >>= 8n;
        }
        const b64 = Buffer.from(bytes)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const limbs = jwkModulusToLimbs(b64);
        expect(BigInt(limbs[0])).toBe(0n);
        expect(BigInt(limbs[1])).toBe(1n);
    });

    it('round-trips: recombining the limbs reproduces the modulus', () => {
        // A small but multi-limb value.
        const value = (1n << 130n) + (1n << 5n) + 7n;
        const bytes: number[] = [];
        let v = value;
        while (v > 0n) {
            bytes.unshift(Number(v & 0xffn));
            v >>= 8n;
        }
        const b64 = Buffer.from(bytes)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const limbs = jwkModulusToLimbs(b64);
        let recombined = 0n;
        for (let i = 17; i >= 0; i--) {
            recombined = (recombined << 120n) + BigInt(limbs[i]);
        }
        expect(recombined).toBe(value);
    });
});

describe('hashLimbs', () => {
    it('is deterministic and 32 bytes', () => {
        const limbs = jwkModulusToLimbs('AQAB');
        const a = hashLimbs(limbs);
        const b = hashLimbs(limbs);
        expect(a).toBe(b);
        expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('differs for different moduli', () => {
        expect(hashLimbs(jwkModulusToLimbs('AQ'))).not.toBe(hashLimbs(jwkModulusToLimbs('Aw')));
    });
});

describe('parseBoolean', () => {
    it('treats common truthy strings as true', () => {
        for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
            expect(parseBoolean(v, false)).toBe(true);
        }
    });

    it('falls back for empty/undefined', () => {
        expect(parseBoolean(undefined, true)).toBe(true);
        expect(parseBoolean('', true)).toBe(true);
        expect(parseBoolean(null, false)).toBe(false);
    });

    it('treats anything else as false', () => {
        expect(parseBoolean('nope', true)).toBe(false);
    });
});

describe('parsePositiveInt (revocation-rail bounds)', () => {
    it('parses non-negative integers', () => {
        expect(parsePositiveInt('0', 5)).toBe(0);
        expect(parsePositiveInt('3', 5)).toBe(3);
    });

    it('falls back on garbage, negatives, and floats', () => {
        expect(parsePositiveInt('-1', 5)).toBe(5);
        expect(parsePositiveInt('1.5', 5)).toBe(5);
        expect(parsePositiveInt('abc', 5)).toBe(5);
        expect(parsePositiveInt(undefined, 5)).toBe(5);
    });
});

describe('hex helpers', () => {
    it('round-trips bytes <-> hex', () => {
        const hex = bigIntToFieldHex(255n);
        expect(hex).toBe('0x' + '0'.repeat(62) + 'ff');
        expect(bytesToHex(hexToBytes(hex, 32))).toBe(hex);
    });

    it('rejects malformed hex', () => {
        expect(() => hexToBytes('0xzz' as `0x${string}`)).toThrow();
    });
});

describe('executeRevocations grace markers', () => {
    const KEY = ('0x' + 'aa'.repeat(32)) as `0x${string}`;

    function makeKv() {
        const store = new Map<string, string>();
        return {
            store,
            get: (k: string): Promise<string | null> => Promise.resolve(store.get(k) ?? null),
            put: (k: string, v: string): Promise<void> => {
                store.set(k, v);
                return Promise.resolve();
            },
            delete: (k: string): Promise<void> => {
                store.delete(k);
                return Promise.resolve();
            },
        };
    }

    function makeCtx(overrides: Partial<RevocationContext>): RevocationContext {
        return {
            currentKeys: [],
            currentHashes: new Set<string>([KEY]),
            registryKeys: [{ keyHash: KEY, active: true }],
            registeredThisRun: 0,
            dryRun: false,
            ...overrides,
        } as RevocationContext;
    }

    it('clears a reappeared key grace marker even when nothing is stale', async () => {
        const kv = makeKv();
        kv.store.set(graceMarkerKey(KEY), '1000'); // marker from an earlier disappearance
        const env = {
            ROTATION_STATE: kv,
        } as unknown as Parameters<typeof executeRevocations>[0];

        // KEY is present again (currentHashes has it) and is the only registry key,
        // so staleKeys is empty. The pre-fix ordering returned before clearing, so
        // a later disappearance would have been revoked on the first missing run.
        const actions = await executeRevocations(env, makeCtx({}));

        expect(kv.store.has(graceMarkerKey(KEY))).toBe(false);
        expect(actions).toEqual([]);
    });

    it('does not mutate rotation state on a dry run', async () => {
        const kv = makeKv();
        kv.store.set(graceMarkerKey(KEY), '1000');
        const env = {
            ROTATION_STATE: kv,
        } as unknown as Parameters<typeof executeRevocations>[0];

        await executeRevocations(env, makeCtx({ dryRun: true }));

        expect(kv.store.get(graceMarkerKey(KEY))).toBe('1000');
    });
});

// Minimal env for the admin-auth gate. The on-chain config is never reached in
// these tests because every request is rejected at requireAdmin() first.
const ADMIN_TOKEN = 'super-secret-trust-root-admin-token';
const ENV = { ADMIN_TOKEN } as unknown as Parameters<typeof worker.fetch>[1];

type AuthResult = { error?: string };

/** Each test uses a distinct IP so the per-isolate failure counter is isolated. */
function req(path: string, method: string, headers: Record<string, string>): Request {
    return new Request(`https://jwt.zarf.to${path}`, { method, headers });
}

describe('jwk-rotation requireAdmin — constant-time compare', () => {
    it('rejects a wrong bearer token with 401', async () => {
        const res = await worker.fetch(
            req('/state', 'GET', {
                Authorization: 'Bearer wrong-token',
                'CF-Connecting-IP': '10.0.0.1',
            }),
            ENV,
        );
        expect(res.status).toBe(401);
        expect(((await res.json()) as AuthResult).error).toBe('unauthorized');
    });

    it('rejects a token that is a prefix of the real one with 401 (no early-out)', async () => {
        const res = await worker.fetch(
            req('/state', 'GET', {
                Authorization: `Bearer ${ADMIN_TOKEN.slice(0, -1)}`,
                'CF-Connecting-IP': '10.0.0.2',
            }),
            ENV,
        );
        expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header with 401', async () => {
        const res = await worker.fetch(
            req('/rotate', 'POST', { 'CF-Connecting-IP': '10.0.0.3' }),
            ENV,
        );
        expect(res.status).toBe(401);
    });

    it('returns 503 when ADMIN_TOKEN is unset (before any compare)', async () => {
        const res = await worker.fetch(
            req('/state', 'GET', { 'CF-Connecting-IP': '10.0.0.4' }),
            {} as unknown as Parameters<typeof worker.fetch>[1],
        );
        expect(res.status).toBe(503);
        expect(((await res.json()) as AuthResult).error).toBe('admin_token_not_configured');
    });
});

describe('jwk-rotation requireAdmin — per-IP failure rate limit', () => {
    it('locks out an IP with 429 after repeated failed admin attempts', async () => {
        const ip = '10.1.0.1';
        // 10 allowed failures (each 401), then the 11th is throttled.
        for (let i = 0; i < 10; i += 1) {
            const res = await worker.fetch(
                req('/state', 'GET', {
                    Authorization: 'Bearer wrong-token',
                    'CF-Connecting-IP': ip,
                }),
                ENV,
            );
            expect(res.status, `attempt ${i + 1}`).toBe(401);
        }
        const limited = await worker.fetch(
            req('/state', 'GET', {
                Authorization: 'Bearer wrong-token',
                'CF-Connecting-IP': ip,
            }),
            ENV,
        );
        expect(limited.status).toBe(429);
        expect(((await limited.json()) as AuthResult).error).toBe('rate_limited');
        expect(limited.headers.get('Retry-After')).toBe('60');
    });

    it('does not throttle a different IP that has not failed', async () => {
        // Burn one IP down to the limit.
        const hot = '10.1.0.2';
        for (let i = 0; i < 11; i += 1) {
            await worker.fetch(
                req('/rotate', 'POST', {
                    Authorization: 'Bearer wrong-token',
                    'CF-Connecting-IP': hot,
                }),
                ENV,
            );
        }
        // A fresh IP is still served (401, not 429).
        const fresh = await worker.fetch(
            req('/rotate', 'POST', {
                Authorization: 'Bearer wrong-token',
                'CF-Connecting-IP': '10.1.0.3',
            }),
            ENV,
        );
        expect(fresh.status).toBe(401);
    });
});
