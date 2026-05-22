import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCoreConfigForTests, configureCore } from '../config/runtime';
import {
    __resetDistributionDiscoveryForTests,
    fetchContractMetadata,
    sanitizeString,
} from './distributionDiscovery';

// `sanitizeString` runs on every name/description/symbol read from on-chain
// untrusted input. Locking down the strip-then-truncate semantics matters:
// the name field is what the user sees in their wallet's confirm dialog.

describe('sanitizeString', () => {
    it('strips ASCII control bands (0x00–0x1F and 0x7F–0x9F), then truncates', () => {
        expect(sanitizeString('a\x00b\x07c\x1Fd\x7Fe\x9Ff', 100)).toBe('abcdef');
        // strip-then-truncate: control chars don't count toward maxLength
        expect(sanitizeString('a\x00b\x00c\x00d', 4)).toBe('abcd');
    });

    it('caps at maxLength and handles empty/falsy input', () => {
        expect(sanitizeString('abcdefghij', 5)).toBe('abcde');
        expect(sanitizeString('', 50)).toBe('');
        expect(sanitizeString(null as unknown as string, 50)).toBe('');
    });

    it('locks-in: passes Unicode through and does NOT escape HTML (callers must escape on render)', () => {
        expect(sanitizeString('café 🎁', 50)).toBe('café 🎁');
        expect(sanitizeString('<b>x</b>', 50)).toBe('<b>x</b>');
    });
});

describe('fetchContractMetadata', () => {
    beforeEach(() => {
        __resetDistributionDiscoveryForTests();
        __resetCoreConfigForTests();
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        __resetCoreConfigForTests();
        vi.unstubAllGlobals();
    });

    it('uses the configured indexer and maps bigint fields from strings', async () => {
        configureCore({
            stellar: { id: 'testnet' },
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({
                address: 'CVESTING',
                name: 'Team Grant',
                description: 'May cohort',
                token: 'CTOKEN',
                tokenSymbol: 'ZRF',
                tokenDecimals: 7,
                owner: 'GOWNER',
                vestingStart: '0',
                cliffDuration: '0',
                vestingDuration: '0',
                vestingPeriod: '0',
                tokenBalance: '42000000',
                metadataCid: 'bafy-metadata',
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const metadata = await fetchContractMetadata('CVESTING');

        expect(fetchMock.mock.calls[0][0]).toBe('https://indexer.zarf.to/v1/testnet/vestings/CVESTING');
        expect(metadata?.tokenBalance).toBe(42_000_000n);
        expect(metadata?.metadataCid).toBe('bafy-metadata');
    });

    it('does not fall back to direct RPC when the indexer fails', async () => {
        configureCore({
            stellar: { id: 'testnet' },
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ error: 'down' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const metadata = await fetchContractMetadata('CVESTING');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(metadata).toBeNull();
    });
});
