import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetDistributionDiscoveryForTests,
    fetchContractMetadata,
    sanitizeString,
} from './distributionDiscovery';

const contractMocks = vi.hoisted(() => ({
    getCidForVesting: vi.fn(),
    getOwnerDeployment: vi.fn(),
    getOwnerDeploymentCount: vi.fn(),
    getTokenBalance: vi.fn(),
    readVestingContract: vi.fn(),
}));

vi.mock('../contracts/contracts', () => contractMocks);

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
        vi.clearAllMocks();
        __resetDistributionDiscoveryForTests();
    });

    it('reads the vesting contract token balance so active distributions can be classified', async () => {
        contractMocks.readVestingContract.mockResolvedValue({
            name: 'Team Grant',
            description: 'May cohort',
            owner: 'GOWNER',
            token: 'CTOKEN',
            merkleRoot: '0xabc',
            tokenSymbol: 'ZRF',
            tokenDecimals: 7,
        });
        contractMocks.getCidForVesting.mockResolvedValue('bafy-metadata');
        contractMocks.getTokenBalance.mockResolvedValue(42_000_000n);

        const metadata = await fetchContractMetadata('CVESTING');

        expect(contractMocks.getTokenBalance).toHaveBeenCalledWith('CTOKEN', 'CVESTING');
        expect(metadata?.tokenBalance).toBe(42_000_000n);
        expect(metadata?.metadataCid).toBe('bafy-metadata');
    });

    it('keeps metadata visible if only the balance read fails', async () => {
        contractMocks.readVestingContract.mockResolvedValue({
            name: 'Team Grant',
            description: '',
            owner: 'GOWNER',
            token: 'CTOKEN',
            merkleRoot: '0xabc',
            tokenSymbol: 'ZRF',
            tokenDecimals: 7,
        });
        contractMocks.getCidForVesting.mockResolvedValue(null);
        contractMocks.getTokenBalance.mockRejectedValue(new Error('RPC timeout'));

        const metadata = await fetchContractMetadata('CVESTING');

        expect(metadata?.address).toBe('CVESTING');
        expect(metadata?.tokenBalance).toBe(0n);
    });
});
