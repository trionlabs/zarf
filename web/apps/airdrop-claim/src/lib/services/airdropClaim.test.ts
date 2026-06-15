import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildClaimList, type AirdropClaimListJson } from '@zarf/core/merkle';
import {
    validateClaimList,
    findClaim,
    verifyClaimProof,
    loadClaimList,
    mapLoadError,
    deriveClaimStatus,
    ClaimListError,
    type ClaimStatusInputs,
    type MatchedClaim,
} from './airdropClaim';

// Self-contained module stub: provides the mock fetch + a faithful
// IpfsFetchError (the service only imports these two from ipfsFetch).
const { fetchIpfsJsonMock } = vi.hoisted(() => ({ fetchIpfsJsonMock: vi.fn() }));
vi.mock('@zarf/core/utils/ipfsFetch', () => {
    class IpfsFetchError extends Error {
        cid: string;
        code: string;
        constructor(message: string, cid: string, code = 'GATEWAY_FAILURE') {
            super(message);
            this.name = 'IpfsFetchError';
            this.cid = cid;
            this.code = code;
        }
    }
    return { fetchIpfsJson: fetchIpfsJsonMock, IpfsFetchError };
});
import { IpfsFetchError } from '@zarf/core/utils/ipfsFetch';

// Real testnet strkeys (3 recipients) + airdrop/token C-addresses.
const A = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';
const B = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const C = 'GD7CWARMCNDW4IMEJSDVIOK6JYQYOESFVSFOETF3VJYUUKWLHUUBHF2R';
const AIRDROP = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

const doc: AirdropClaimListJson = buildClaimList(
    { network: 'testnet', airdrop: AIRDROP, token: TOKEN },
    [
        { address: A, amount: '1000000' },
        { address: B, amount: '2000000' },
        { address: C, amount: '3000000' },
    ],
);

describe('validateClaimList', () => {
    it('accepts a well-formed claim-list', () => {
        expect(validateClaimList(doc)).toBe(doc);
    });

    it('rejects bad shapes', () => {
        expect(() => validateClaimList(null)).toThrow(ClaimListError);
        expect(() => validateClaimList({ ...doc, v: 2 })).toThrow(ClaimListError);
        expect(() => validateClaimList({ ...doc, network: 'futurenet' })).toThrow(ClaimListError);
        expect(() => validateClaimList({ ...doc, root: 'deadbeef' })).toThrow(/merkle root/);
        expect(() => validateClaimList({ ...doc, claims: [] })).toThrow(/Empty/);
        expect(() =>
            validateClaimList({ ...doc, claims: [{ address: A, amount: '1.5', proof: [] }] }),
        ).toThrow(/bad amount/);
    });
});

describe('findClaim', () => {
    it('matches a mixed-case address and returns the array-position index', () => {
        const m = findClaim(doc, B.toLowerCase());
        expect(m).not.toBeNull();
        expect(m!.index).toBe(1); // array position = the index the contract receives
        expect(m!.address).toBe(B); // stored (UPPERCASE) value, verbatim
        expect(m!.amount).toBe('2000000');
    });

    it('returns null for an address not in the list', () => {
        expect(
            findClaim(doc, 'GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAAAJLK'),
        ).toBeNull();
    });
});

describe('verifyClaimProof', () => {
    it('verifies a real proof against the real root', () => {
        const m = findClaim(doc, A)!;
        expect(verifyClaimProof(doc, m)).toBe(true);
    });

    it('fails on a tampered root', () => {
        const m = findClaim(doc, A)!;
        expect(verifyClaimProof({ ...doc, root: `0x${'00'.repeat(32)}` }, m)).toBe(false);
    });

    it('fails on a tampered amount', () => {
        const m = findClaim(doc, A)!;
        expect(verifyClaimProof(doc, { ...m, amount: '999999999' })).toBe(false);
    });
});

describe('loadClaimList', () => {
    beforeEach(() => fetchIpfsJsonMock.mockReset());

    it('returns the validated doc on success', async () => {
        fetchIpfsJsonMock.mockResolvedValue(doc);
        await expect(loadClaimList('bafyTEST')).resolves.toBe(doc);
    });

    it('rejects a fetched doc that fails schema validation', async () => {
        fetchIpfsJsonMock.mockResolvedValue({ v: 99 });
        await expect(loadClaimList('bafyTEST')).rejects.toBeInstanceOf(ClaimListError);
    });
});

describe('mapLoadError', () => {
    it('maps a gateway IpfsFetchError to a retry message', () => {
        const err = new IpfsFetchError('boom', 'bafyTEST', 'GATEWAY_FAILURE');
        const mapped = mapLoadError(err);
        expect(mapped).toBeInstanceOf(ClaimListError);
        expect(mapped.message).toMatch(/try again/);
    });

    it('maps a malformed-CID IpfsFetchError to a malformed-link message', () => {
        expect(mapLoadError(new IpfsFetchError('bad', 'x', 'INVALID_CID')).message).toMatch(
            /malformed/,
        );
    });

    it('maps an unknown error to a generic ClaimListError', () => {
        expect(mapLoadError(new Error('nope'))).toBeInstanceOf(ClaimListError);
    });
});

describe('deriveClaimStatus', () => {
    const matched: MatchedClaim = findClaim(doc, A)!;
    const base = (): ClaimStatusInputs => ({
        loading: false,
        loadFailed: false,
        doc,
        appNetwork: 'testnet',
        walletConnected: true,
        walletWrongNetwork: false,
        matched,
        proofValid: true,
        rootMatches: true,
        deadline: 0,
        isClaimedOnChain: false,
        nowSec: 1_000_000,
        tx: { submitting: false, success: false, failed: false },
    });

    it('eligible when everything checks out', () => {
        expect(deriveClaimStatus(base())).toBe('eligible');
    });

    it('in-flight tx states take precedence', () => {
        expect(
            deriveClaimStatus({
                ...base(),
                tx: { submitting: true, success: false, failed: false },
            }),
        ).toBe('submitting');
        expect(
            deriveClaimStatus({
                ...base(),
                tx: { submitting: false, success: true, failed: false },
            }),
        ).toBe('success');
        expect(
            deriveClaimStatus({
                ...base(),
                tx: { submitting: false, success: false, failed: true },
            }),
        ).toBe('tx-error');
    });

    it('loading / load-error', () => {
        expect(deriveClaimStatus({ ...base(), loading: true })).toBe('loading');
        expect(deriveClaimStatus({ ...base(), loadFailed: true })).toBe('load-error');
        expect(deriveClaimStatus({ ...base(), doc: null })).toBe('load-error');
    });

    it('wrong-network when the app network differs from the doc', () => {
        expect(deriveClaimStatus({ ...base(), appNetwork: 'mainnet' })).toBe('wrong-network');
    });

    it('no-wallet when not connected (network ok)', () => {
        expect(deriveClaimStatus({ ...base(), walletConnected: false })).toBe('no-wallet');
    });

    it('wrong-network when the wallet is on another network', () => {
        expect(deriveClaimStatus({ ...base(), walletWrongNetwork: true })).toBe('wrong-network');
    });

    it('not-in-list when connected but no match', () => {
        expect(deriveClaimStatus({ ...base(), matched: null })).toBe('not-in-list');
    });

    it('invalid-list when the client proof fails or the root does not bind on-chain', () => {
        expect(deriveClaimStatus({ ...base(), proofValid: false })).toBe('invalid-list');
        expect(deriveClaimStatus({ ...base(), rootMatches: false })).toBe('invalid-list');
    });

    it('loading while the on-chain config/claimed reads are pending', () => {
        expect(deriveClaimStatus({ ...base(), rootMatches: null })).toBe('loading');
        expect(deriveClaimStatus({ ...base(), deadline: null })).toBe('loading');
        expect(deriveClaimStatus({ ...base(), isClaimedOnChain: null })).toBe('loading');
    });

    it('expired only when a deadline is set and passed', () => {
        expect(deriveClaimStatus({ ...base(), deadline: 500, nowSec: 1000 })).toBe('expired');
        expect(deriveClaimStatus({ ...base(), deadline: 0, nowSec: 1e12 })).toBe('eligible'); // 0 = no deadline
        expect(deriveClaimStatus({ ...base(), deadline: 2000, nowSec: 1000 })).toBe('eligible');
    });

    it('already-claimed when the on-chain bit is set', () => {
        expect(deriveClaimStatus({ ...base(), isClaimedOnChain: true })).toBe('already-claimed');
    });
});
