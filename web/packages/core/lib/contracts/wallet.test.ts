import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCoreConfigForTests, configureCore } from '../config/runtime';
import type { StellarAddress } from '../types';
import {
    formatAddress,
    getNativeBalance,
    isMainnetPassphrase,
    isSupportedNetwork,
    networkLabelFromPassphrase,
    STELLAR_PASSPHRASE,
} from './wallet';

const TESTNET = STELLAR_PASSPHRASE.TESTNET;
const MAINNET = STELLAR_PASSPHRASE.PUBLIC;
const ADDR = 'GD7CWARMCNDW4IMEJSDVIOK6JYQYOESFVSFOETF3VJYUUKWLHUUBHF2R' as StellarAddress;

function configureTestnet() {
    configureCore({
        stellar: {
            id: 'testnet',
            networkPassphrase: TESTNET,
            horizonUrl: 'https://horizon.example',
        },
    });
}

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response as Response));
}

beforeEach(() => {
    __resetCoreConfigForTests();
    vi.unstubAllGlobals();
});

afterEach(() => {
    __resetCoreConfigForTests();
    vi.unstubAllGlobals();
});

describe('networkLabelFromPassphrase', () => {
    it('maps the public passphrase to MAINNET (trusted label, not the wallet name)', () => {
        expect(networkLabelFromPassphrase(MAINNET)).toBe('MAINNET');
    });
    it('maps the test passphrase to TESTNET', () => {
        expect(networkLabelFromPassphrase(TESTNET)).toBe('TESTNET');
    });
    it('returns null when no passphrase is known', () => {
        expect(networkLabelFromPassphrase(undefined)).toBeNull();
        expect(networkLabelFromPassphrase(null)).toBeNull();
        expect(networkLabelFromPassphrase('')).toBeNull();
    });
    it('returns UNKNOWN for an unrecognized passphrase', () => {
        expect(networkLabelFromPassphrase('Some Custom Network ; 2099')).toBe('UNKNOWN');
    });
});

describe('isMainnetPassphrase', () => {
    it('is true only for the public passphrase', () => {
        expect(isMainnetPassphrase(MAINNET)).toBe(true);
        expect(isMainnetPassphrase(TESTNET)).toBe(false);
        expect(isMainnetPassphrase(undefined)).toBe(false);
        expect(isMainnetPassphrase(null)).toBe(false);
    });
});

describe('isSupportedNetwork', () => {
    it('accepts only the configured network passphrase', () => {
        configureTestnet();
        expect(isSupportedNetwork(TESTNET)).toBe(true);
        expect(isSupportedNetwork(MAINNET)).toBe(false);
        expect(isSupportedNetwork(undefined)).toBe(false);
    });
});

describe('formatAddress', () => {
    it('truncates to the first 6 and last 6 characters', () => {
        expect(formatAddress(ADDR)).toBe('GD7CWA...UBHF2R');
    });
    it('returns an empty string for empty input', () => {
        expect(formatAddress('')).toBe('');
    });
});

describe('getNativeBalance', () => {
    it('returns a zero balance for an unfunded account (Horizon 404)', async () => {
        configureTestnet();
        mockFetch({ ok: false, status: 404 });
        await expect(getNativeBalance(ADDR)).resolves.toEqual({
            value: 0n,
            reserved: 0n,
            spendable: 0n,
            formatted: '0',
            symbol: 'XLM',
        });
    });

    it('parses the native balance and reserve from a funded account', async () => {
        configureTestnet();
        mockFetch({
            ok: true,
            status: 200,
            json: async () => ({
                subentry_count: 1,
                balances: [
                    { asset_type: 'credit_alphanum4', balance: '5.0' },
                    { asset_type: 'native', balance: '10000.0000000' },
                ],
            }),
        });
        const bal = await getNativeBalance(ADDR);
        expect(bal.symbol).toBe('XLM');
        expect(bal.formatted).toBe('10000.0000000');
        expect(bal.value).toBe(100_000_000_000n); // 10000 XLM in stroops
        // (2 base reserves + 1 subentry) × 0.5 XLM = 1.5 XLM reserved
        expect(bal.reserved).toBe(15_000_000n);
        expect(bal.spendable).toBe(100_000_000_000n - 15_000_000n);
    });

    it('throws on a non-404 Horizon error', async () => {
        configureTestnet();
        mockFetch({ ok: false, status: 500 });
        await expect(getNativeBalance(ADDR)).rejects.toThrow(/500/);
    });

    it('defaults to 0 when the account has no native balance line', async () => {
        configureTestnet();
        mockFetch({ ok: true, status: 200, json: async () => ({ balances: [] }) });
        const bal = await getNativeBalance(ADDR);
        expect(bal.formatted).toBe('0');
        expect(bal.value).toBe(0n);
        expect(bal.spendable).toBe(0n);
    });
});
