/**
 * Network-less unit tests for the additive airdrop progress route (17-m7 §T4).
 *
 * The route's RPC fan-out (config + claimed_statuses + balance) is exercised
 * live by the testnet e2e (§T5); here we pin the pure, security-bearing pieces:
 * the recipients hard-clamp, bitmap popcount, the wire shape consumed by
 * @zarf/core, the cache-TTL rule, the Config decode, and the fail-closed CORS
 * helper (shared — so this also covers the deliberate vesting tightening, §6).
 */
import { describe, expect, it } from 'vitest';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

import {
    airdropProgressTtl,
    buildAirdropProgressBody,
    buildCorsHeaders,
    decodeAirdropConfig,
    parseRecipients,
    popcountStatuses,
} from './index';

const C_ADDR = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';

describe('parseRecipients (hard server-side clamp — primary DoS control)', () => {
    it('accepts a positive integer up to and including the cap', () => {
        expect(parseRecipients('50', 10_000)).toBe(50);
        expect(parseRecipients('10000', 10_000)).toBe(10_000); // boundary OK
        expect(parseRecipients('1', 10_000)).toBe(1);
    });

    it('rejects a missing, empty, non-integer or non-positive value (400)', () => {
        expect(() => parseRecipients(null, 10_000)).toThrow();
        expect(() => parseRecipients('', 10_000)).toThrow();
        expect(() => parseRecipients('0', 10_000)).toThrow();
        expect(() => parseRecipients('-5', 10_000)).toThrow();
        expect(() => parseRecipients('3.5', 10_000)).toThrow();
        expect(() => parseRecipients('abc', 10_000)).toThrow();
    });

    it('rejects a value over the cap rather than scanning unbounded (400)', () => {
        expect(() => parseRecipients('10001', 10_000)).toThrow();
    });
});

describe('popcountStatuses', () => {
    it('counts truthy bitmap entries only', () => {
        expect(popcountStatuses([true, false, true])).toBe(2);
        expect(popcountStatuses([false, false])).toBe(0);
        expect(popcountStatuses([])).toBe(0);
    });
});

describe('buildAirdropProgressBody (IndexerAirdropProgress wire shape)', () => {
    it('emits exactly the consumer keys, with i128 fields as decimal strings', () => {
        const body = buildAirdropProgressBody({
            claimedCount: 3,
            recipientCount: 81,
            totalAmount: 1_000n,
            contractBalance: 700n,
            deadline: 1_700_000_000,
            locked: true,
        });
        expect(Object.keys(body).sort()).toEqual(
            [
                'claimedCount',
                'contractBalance',
                'deadline',
                'locked',
                'recipientCount',
                'totalAmount',
            ].sort(),
        );
        expect(body.totalAmount).toBe('1000');
        expect(body.contractBalance).toBe('700');
        expect(typeof body.claimedCount).toBe('number');
        expect(typeof body.recipientCount).toBe('number');
        expect(typeof body.deadline).toBe('number');
        expect(body.locked).toBe(true);
    });

    it('stringifies a large i128 amount losslessly (no Number coercion)', () => {
        const big = (1n << 120n) - 1n;
        expect(
            buildAirdropProgressBody({
                claimedCount: 0,
                recipientCount: 1,
                totalAmount: big,
                contractBalance: 0n,
                deadline: 0,
                locked: false,
            }).totalAmount,
        ).toBe(big.toString());
    });
});

describe('airdropProgressTtl', () => {
    it('caches a fully-claimed (terminal) response long', () => {
        expect(airdropProgressTtl(JSON.stringify({ claimedCount: 81, recipientCount: 81 }))).toBe(
            3_600,
        );
    });

    it('caches a partial response briefly', () => {
        expect(airdropProgressTtl(JSON.stringify({ claimedCount: 5, recipientCount: 81 }))).toBe(
            10,
        );
    });

    it('treats an empty recipient set as live, never terminal', () => {
        expect(airdropProgressTtl(JSON.stringify({ claimedCount: 0, recipientCount: 0 }))).toBe(10);
    });

    it('falls back to no-cache on unparseable bodies', () => {
        expect(airdropProgressTtl('not json')).toBe(0);
    });
});

describe('buildCorsHeaders (fail-closed — shared across all routes incl. vesting)', () => {
    const env = { ALLOWED_ORIGINS: 'https://a.example,https://b.example' };

    it('echoes an allow-listed Origin', () => {
        expect(buildCorsHeaders('https://a.example', env)['Access-Control-Allow-Origin']).toBe(
            'https://a.example',
        );
    });

    it('omits ACAO for an unmatched Origin (no allowed[0] / * fallback)', () => {
        expect(
            buildCorsHeaders('https://evil.example', env)['Access-Control-Allow-Origin'],
        ).toBeUndefined();
    });

    it('omits ACAO for an absent Origin', () => {
        expect(buildCorsHeaders(null, env)['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('omits ACAO entirely when ALLOWED_ORIGINS is unset (no wildcard leak)', () => {
        expect(
            buildCorsHeaders('https://a.example', {})['Access-Control-Allow-Origin'],
        ).toBeUndefined();
    });

    it('always returns the static CORS headers', () => {
        const headers = buildCorsHeaders(null, env);
        expect(headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
        expect(headers['Vary']).toBe('Origin');
    });
});

describe('decodeAirdropConfig', () => {
    function configScVal(opts: {
        token: string;
        total: bigint;
        deadline: number;
        locked: boolean;
    }): xdr.ScVal {
        const entry = (key: string, val: xdr.ScVal) =>
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
        // Field order is irrelevant: scMap rebuilds a keyed Map before lookup.
        return xdr.ScVal.scvMap([
            entry('token', Address.fromString(opts.token).toScVal()),
            entry('total', nativeToScVal(opts.total, { type: 'i128' })),
            entry('deadline', nativeToScVal(opts.deadline, { type: 'u64' })),
            entry('locked', xdr.ScVal.scvBool(opts.locked)),
        ]);
    }

    it('decodes token / total (i128) / deadline (u64) / locked from a Config ScVal', () => {
        const decoded = decodeAirdropConfig(
            configScVal({
                token: C_ADDR,
                total: 123_456_789_012_345_678_901_234_567_890n,
                deadline: 1_700_000_000,
                locked: true,
            }),
        );
        expect(decoded.token).toBe(C_ADDR);
        expect(decoded.total).toBe(123_456_789_012_345_678_901_234_567_890n);
        expect(decoded.deadline).toBe(1_700_000_000);
        expect(decoded.locked).toBe(true);
    });
});
