import { describe, it, expect } from 'vitest';
import { parseTokenQuery, resolveSac, TokenResolveError } from './tokenAsset';

// Network passphrases (avoid importing the SDK at module scope in tests).
const TESTNET = 'Test SDF Network ; September 2015';
const PUBLIC = 'Public Global Stellar Network ; September 2015';

// Known-good fixtures (verified against the SDK + Stellar Expert).
const XLM_TESTNET_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const XLM_MAINNET_SAC = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const USDC_MAINNET_SAC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

describe('parseTokenQuery', () => {
    it('classifies a Soroban contract id', () => {
        expect(parseTokenQuery(XLM_TESTNET_SAC)).toEqual({
            kind: 'contract',
            address: XLM_TESTNET_SAC,
        });
    });

    it('classifies a classic CODE:ISSUER asset (issuer upper-cased)', () => {
        expect(parseTokenQuery(`USDC:${USDC_ISSUER.toLowerCase()}`)).toEqual({
            kind: 'classic',
            code: 'USDC',
            issuer: USDC_ISSUER,
        });
    });

    it('classifies native XLM', () => {
        expect(parseTokenQuery('XLM').kind).toBe('native');
        expect(parseTokenQuery('native').kind).toBe('native');
    });

    it('rejects junk, half-addresses, and bad issuers', () => {
        expect(parseTokenQuery('').kind).toBe('invalid');
        expect(parseTokenQuery('hello world').kind).toBe('invalid');
        expect(parseTokenQuery('USDC:not-an-issuer').kind).toBe('invalid');
        expect(parseTokenQuery(XLM_TESTNET_SAC.slice(0, 40)).kind).toBe('invalid');
    });
});

describe('resolveSac', () => {
    it('derives the native XLM SAC on each network', async () => {
        expect(await resolveSac('XLM', TESTNET)).toBe(XLM_TESTNET_SAC);
        expect(await resolveSac('native', PUBLIC)).toBe(XLM_MAINNET_SAC);
    });

    it('derives a classic CODE:ISSUER SAC matching the on-chain wrapper', async () => {
        expect(await resolveSac(`USDC:${USDC_ISSUER}`, PUBLIC)).toBe(USDC_MAINNET_SAC);
    });

    it('passes a checksum-valid contract id straight through', async () => {
        expect(await resolveSac(XLM_TESTNET_SAC, TESTNET)).toBe(XLM_TESTNET_SAC);
    });

    it('rejects a contract id that fails its StrKey checksum', async () => {
        const badChecksum = XLM_TESTNET_SAC.slice(0, -1) + 'A';
        await expect(resolveSac(badChecksum, TESTNET)).rejects.toBeInstanceOf(TokenResolveError);
    });

    it('rejects unparseable input', async () => {
        await expect(resolveSac('nope', TESTNET)).rejects.toBeInstanceOf(TokenResolveError);
    });
});
