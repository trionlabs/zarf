import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCoreConfigForTests, configureCore } from '../config/runtime';
import { clearIpfsCache, fetchIpfsEmailHashes, fetchIpfsJson, IpfsFetchError } from './ipfsFetch';

const CID_V0 = 'QmXDPJoABe6ysT6seSWk2M3TPZTyjkfdJS17iygh6irNr3';
// CIDs that genuinely hash from the mocked gateway bodies below (Pinata
// dag-pb/UnixFS profile) — the gateway path re-verifies bytes against the
// CID, so mocks must serve authentic content.
const CID_GATEWAY_BODY = '{"ok":true,"source":"gateway"}';
const CID_GATEWAY = 'QmXR9T7r5vPT6EWfesYX4i1zBVfWZPQ73R2hh5YqzAJwr8';
const CID_OK_BODY = '{"ok":true}';
const CID_OK = 'QmbAvcZz4eFpAVCH33A8pxKb6YJW31BfGzw3ZFf9y27ngE';

describe('fetchIpfsJson', () => {
    beforeEach(() => {
        clearIpfsCache();
        __resetCoreConfigForTests();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        clearIpfsCache();
        __resetCoreConfigForTests();
        vi.unstubAllGlobals();
    });

    it('uses the configured indexer for IPFS JSON', async () => {
        configureCore({
            stellar: {},
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_V0)).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe(`https://indexer.zarf.to/v1/ipfs/${CID_V0}`);
    });

    it('accepts ipfs://CID values and normalizes to the raw CID for the indexer', async () => {
        configureCore({
            stellar: {},
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(`ipfs://${CID_V0}`)).resolves.toEqual({ ok: true });
        expect(fetchMock.mock.calls[0][0]).toBe(`https://indexer.zarf.to/v1/ipfs/${CID_V0}`);
    });

    it('falls back to a public gateway when the indexer fails', async () => {
        configureCore({
            stellar: {},
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(async (url: string | URL | Request) =>
            String(url).includes('indexer.zarf.to')
                ? new Response(JSON.stringify({ error: 'down' }), {
                      status: 503,
                      headers: { 'Content-Type': 'application/json' },
                  })
                : new Response(CID_GATEWAY_BODY, {
                      status: 200,
                      headers: { 'Content-Type': 'application/json' },
                  }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_GATEWAY)).resolves.toEqual({ ok: true, source: 'gateway' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toBe(`https://indexer.zarf.to/v1/ipfs/${CID_GATEWAY}`);
        expect(fetchMock.mock.calls[1][0]).toBe(`https://gateway.pinata.cloud/ipfs/${CID_GATEWAY}`);
    });

    it('uses a public gateway when the indexer URL is not configured', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(CID_OK_BODY, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_OK)).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe(`https://gateway.pinata.cloud/ipfs/${CID_OK}`);
    });

    it('rejects gateway responses whose bytes do not hash to the CID', async () => {
        // Every gateway 200s with content for a DIFFERENT cid — a tampering
        // or cache-poisoning scenario. All four must be rejected.
        const fetchMock = vi.fn(
            async () =>
                new Response('{"ok":true,"source":"evil"}', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_OK)).rejects.toMatchObject({
            name: 'IpfsFetchError',
            code: 'GATEWAY_FAILURE',
            message: expect.stringContaining('content hash does not match CID'),
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('rejects oversized gateway responses before parsing', async () => {
        const huge = `{"pad":"${'x'.repeat(9 * 1024 * 1024)}"}`;
        const fetchMock = vi.fn(
            async () =>
                new Response(huge, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_OK)).rejects.toMatchObject({
            name: 'IpfsFetchError',
            code: 'GATEWAY_FAILURE',
            message: expect.stringContaining('exceeds'),
        });
    });

    it('accepts content too large for single-block verification with a warning', async () => {
        // > 256 KiB dag-pb content is a multi-block DAG — the root hash is
        // not reconstructible from content bytes, so it is accepted (the
        // Merkle-relevant consumers re-verify against the on-chain root).
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const big = `{"pad":"${'x'.repeat(300_000)}"}`;
        const fetchMock = vi.fn(
            async () =>
                new Response(big, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_OK)).resolves.toEqual({ pad: 'x'.repeat(300_000) });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unverifiable'));
    });

    it('reports gateway failure after indexer and public gateway attempts fail', async () => {
        configureCore({
            stellar: {},
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ error: 'down' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_V0)).rejects.toMatchObject({
            name: 'IpfsFetchError',
            code: 'GATEWAY_FAILURE',
        } satisfies Partial<IpfsFetchError>);
        expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('rejects placeholder metadata strings before hitting the indexer', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson('ipfs://zarf-stellar-factory-e2e')).rejects.toMatchObject({
            name: 'IpfsFetchError',
            code: 'INVALID_CID',
        } satisfies Partial<IpfsFetchError>);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

// The eligibility filter depends on this contract: an array means "gated",
// null means "no email gating", and a THROW (never a silent null) means the
// route is unavailable so the caller must fall back to the full document.
describe('fetchIpfsEmailHashes', () => {
    beforeEach(() => {
        clearIpfsCache();
        __resetCoreConfigForTests();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        clearIpfsCache();
        __resetCoreConfigForTests();
        vi.unstubAllGlobals();
    });

    it('returns the hash array from the indexer extraction route', async () => {
        configureCore({
            stellar: {},
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ emailHashes: ['0xabc'], fetchedAt: 1 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsEmailHashes(CID_V0)).resolves.toEqual(['0xabc']);
        expect(fetchMock.mock.calls[0][0]).toBe(
            `https://indexer.zarf.to/v1/ipfs/${CID_V0}/email-hashes`,
        );
    });

    it('returns null for ungated distributions and caches it per CID', async () => {
        configureCore({
            stellar: {},
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ emailHashes: null, fetchedAt: 1 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsEmailHashes(CID_V0)).resolves.toBeNull();
        await expect(fetchIpfsEmailHashes(CID_V0)).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws (no gateway fallback) when the indexer route is missing', async () => {
        configureCore({
            stellar: {},
            indexerUrl: 'https://indexer.zarf.to',
        });
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ error: 'not_found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsEmailHashes(CID_V0)).rejects.toMatchObject({
            name: 'IndexerRequestError',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws when no indexer is configured instead of returning null', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsEmailHashes(CID_V0)).rejects.toMatchObject({
            name: 'IndexerUnavailableError',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
