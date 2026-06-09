import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCoreConfigForTests, configureCore } from '../config/runtime';
import { clearIpfsCache, fetchIpfsJson, IpfsFetchError } from './ipfsFetch';

const CID_V0 = 'QmXDPJoABe6ysT6seSWk2M3TPZTyjkfdJS17iygh6irNr3';

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
                : new Response(JSON.stringify({ ok: true, source: 'gateway' }), {
                      status: 200,
                      headers: { 'Content-Type': 'application/json' },
                  }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_V0)).resolves.toEqual({ ok: true, source: 'gateway' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toBe(`https://indexer.zarf.to/v1/ipfs/${CID_V0}`);
        expect(fetchMock.mock.calls[1][0]).toBe(`https://gateway.pinata.cloud/ipfs/${CID_V0}`);
    });

    it('uses a public gateway when the indexer URL is not configured', async () => {
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
        expect(fetchMock.mock.calls[0][0]).toBe(`https://gateway.pinata.cloud/ipfs/${CID_V0}`);
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
