import { describe, it, expect } from 'vitest';
import {
    getRegistry,
    searchRegistry,
    getRegistryToken,
    getTokenPresets,
} from './tokenRegistry';

const TESTNET_USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

describe('getRegistry', () => {
    it('returns only the requested network and tags everything curated', () => {
        const testnet = getRegistry('testnet');
        expect(testnet.length).toBeGreaterThan(0);
        expect(testnet.every((t) => t.network === 'testnet')).toBe(true);
        expect(testnet.every((t) => t.trust === 'curated')).toBe(true);
    });

    it('isolates networks', () => {
        const mainnet = getRegistry('mainnet');
        expect(mainnet.some((t) => t.network === 'testnet')).toBe(false);
    });
});

describe('searchRegistry', () => {
    it('returns the full list for an empty/whitespace query', () => {
        expect(searchRegistry('testnet', '')).toEqual(getRegistry('testnet'));
        expect(searchRegistry('testnet', '   ')).toEqual(getRegistry('testnet'));
    });

    it('matches symbol and name case-insensitively', () => {
        expect(searchRegistry('testnet', 'usd').map((t) => t.symbol)).toContain('USDC');
        expect(searchRegistry('testnet', 'STELLAR').map((t) => t.symbol)).toContain('XLM');
    });

    it('matches an exact SAC address', () => {
        const hit = searchRegistry('testnet', TESTNET_USDC);
        expect(hit).toHaveLength(1);
        expect(hit[0].sacAddress).toBe(TESTNET_USDC);
    });

    it('returns nothing for an unknown query', () => {
        expect(searchRegistry('testnet', 'zzzznotatoken')).toHaveLength(0);
    });
});

describe('getRegistryToken', () => {
    it('finds a token by network + SAC', () => {
        expect(getRegistryToken('testnet', TESTNET_USDC)?.symbol).toBe('USDC');
    });

    it('does not cross networks', () => {
        expect(getRegistryToken('mainnet', TESTNET_USDC)).toBeUndefined();
    });
});

describe('getTokenPresets (back-compat)', () => {
    it('maps curated tokens to the chip shape', () => {
        const presets = getTokenPresets('testnet');
        expect(presets.length).toBe(getRegistry('testnet').length);
        for (const p of presets) {
            expect(p.label).toBe(p.symbol);
            expect(typeof p.sacAddress).toBe('string');
        }
    });
});
