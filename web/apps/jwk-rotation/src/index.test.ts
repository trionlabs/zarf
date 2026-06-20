import { describe, it, expect } from 'vitest';
import worker from './index';

// Minimal env for the admin-auth gate. The on-chain config is never reached in
// these tests because every request is rejected at requireAdmin() first.
const ADMIN_TOKEN = 'super-secret-trust-root-admin-token';
const ENV = { ADMIN_TOKEN } as unknown as Parameters<typeof worker.fetch>[1];

type AuthResult = { error?: string };

/** Each test uses a distinct IP so the per-isolate failure counter is isolated. */
function req(
    path: string,
    method: string,
    headers: Record<string, string>,
): Request {
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
