import { afterEach, describe, expect, it, vi } from 'vitest';

// The privacy/eligibility filter pulls in the browser-only Pedersen hash and
// the IPFS layer; mock both so we can exercise its decision logic — including
// the documented fail-open behaviors (see docs/adr/0001).
vi.mock('@zarf/core/utils/email', () => ({
    hashEmail: vi.fn(async (email: string) => `0xhash_${email.toLowerCase()}`),
}));
vi.mock('@zarf/core/services/vestingDiscovery', () => ({
    getCidForVesting: vi.fn(async () => 'cid-default'),
}));

const { fetchIpfsEmailHashes, fetchIpfsJson, IpfsFetchError } = vi.hoisted(() => {
    class IpfsFetchError extends Error {
        code: string;
        constructor(message: string, code = 'FETCH_FAILED') {
            super(message);
            this.code = code;
        }
    }
    return { fetchIpfsEmailHashes: vi.fn(), fetchIpfsJson: vi.fn(), IpfsFetchError };
});
vi.mock('@zarf/core/utils/ipfsFetch', () => ({
    fetchIpfsEmailHashes,
    fetchIpfsJson,
    IpfsFetchError,
}));
vi.mock('@zarf/core/utils/log', () => ({ warn: vi.fn(), err: vi.fn() }));

import {
    isEmailInDistribution,
    filterDistributionsByEmail,
    computeUserEmailHash,
} from './emailFilter';

afterEach(() => {
    vi.clearAllMocks();
});

const VESTING = { address: 'CABC', metadataCid: 'cid-1' } as never;

describe('isEmailInDistribution', () => {
    it('returns true when the user hash is in the published list', async () => {
        fetchIpfsEmailHashes.mockResolvedValue(['0xhash_alice@example.com', '0xother']);
        const hash = await computeUserEmailHash('alice@example.com');
        expect(await isEmailInDistribution(VESTING, hash)).toBe(true);
    });

    it('returns false when the user hash is absent', async () => {
        fetchIpfsEmailHashes.mockResolvedValue(['0xother']);
        const hash = await computeUserEmailHash('alice@example.com');
        expect(await isEmailInDistribution(VESTING, hash)).toBe(false);
    });

    it('matches case-insensitively', async () => {
        fetchIpfsEmailHashes.mockResolvedValue(['0XHASH_ALICE@EXAMPLE.COM']);
        expect(await isEmailInDistribution(VESTING, '0xhash_alice@example.com')).toBe(true);
    });

    it('fails OPEN (visible) when a distribution has no emailHashes', async () => {
        fetchIpfsEmailHashes.mockResolvedValue(null);
        expect(await isEmailInDistribution(VESTING, '0xhash_x')).toBe(true);
    });

    it('fails CLOSED (hidden) on an IPFS fetch error', async () => {
        fetchIpfsEmailHashes.mockRejectedValue(new IpfsFetchError('gateway down'));
        fetchIpfsJson.mockRejectedValue(new IpfsFetchError('gateway down'));
        expect(await isEmailInDistribution(VESTING, '0xhash_x')).toBe(false);
    });

    it('fails OPEN on a non-IPFS error (UX fallback)', async () => {
        fetchIpfsEmailHashes.mockRejectedValue(new TypeError('unexpected'));
        fetchIpfsJson.mockRejectedValue(new TypeError('unexpected'));
        expect(await isEmailInDistribution(VESTING, '0xhash_x')).toBe(true);
    });

    it('falls back to the full document when the extraction route is unavailable', async () => {
        fetchIpfsEmailHashes.mockRejectedValue(new Error('404 route missing'));
        fetchIpfsJson.mockResolvedValue({ emailHashes: ['0xhash_bob@example.com'] });
        expect(await isEmailInDistribution(VESTING, '0xhash_bob@example.com')).toBe(true);
    });
});

describe('filterDistributionsByEmail', () => {
    it('returns [] for an empty email (does not leak the list)', async () => {
        expect(await filterDistributionsByEmail([VESTING], '')).toEqual([]);
    });

    it('returns only eligible addresses', async () => {
        fetchIpfsEmailHashes.mockImplementation(async (cid: string) =>
            cid === 'cid-yes' ? ['0xhash_alice@example.com'] : ['0xother'],
        );
        const dists = [
            { address: 'CYES', metadataCid: 'cid-yes' },
            { address: 'CNO', metadataCid: 'cid-no' },
        ] as never[];
        expect(await filterDistributionsByEmail(dists, 'alice@example.com')).toEqual(['CYES']);
    });
});
