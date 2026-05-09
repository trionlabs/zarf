import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetCoreConfigForTests,
    configureCore,
} from '../config/runtime';
import {
    clearIpfsCache,
    fetchIpfsJson,
    IpfsFetchError,
} from './ipfsFetch';

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

    it('uses the configured app gateway before public gateways', async () => {
        configureCore({
            stellar: {},
            ipfsGatewayUrl: 'https://pin.zarf.to/ipfs/',
        });
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(CID_V0)).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe(`https://pin.zarf.to/ipfs/${CID_V0}`);
    });

    it('accepts ipfs://CID values and normalizes to the raw CID for gateway fetches', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson(`ipfs://${CID_V0}`)).resolves.toEqual({ ok: true });
        expect(fetchMock.mock.calls[0][0]).toBe(`https://ipfs.io/ipfs/${CID_V0}`);
    });

    it('rejects placeholder metadata strings before hitting a gateway', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchIpfsJson('ipfs://zarf-stellar-factory-e2e')).rejects.toMatchObject({
            name: 'IpfsFetchError',
            code: 'INVALID_CID',
        } satisfies Partial<IpfsFetchError>);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
