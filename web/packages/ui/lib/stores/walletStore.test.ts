import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TESTNET = 'Test SDF Network ; September 2015';
const PUBLIC = 'Public Global Stellar Network ; September 2015';
const FUTURENET = 'Test SDF Future Network ; October 2022';

// Mock the network store (its module init reads core config, which isn't
// configured here) with a fixed "testnet is active" shape.
vi.mock('./networkStore.svelte', () => ({
    networkStore: {
        get activeId() {
            return 'testnet';
        },
        get active() {
            return { label: 'Testnet' };
        },
    },
}));

vi.mock('@zarf/core/contracts/explorer', () => ({
    getAccountExplorerUrl: (a: string) => `https://stellar.expert/explorer/testnet/account/${a}`,
}));

// Keep the real pure helpers (formatXlmAmount, networkLabelFromPassphrase,
// isMainnetPassphrase, formatAddress); stub the async connectors + the
// config-dependent ones so the store can be driven deterministically.
vi.mock('@zarf/core/contracts/wallet', async (orig) => {
    const actual = (await orig()) as typeof import('@zarf/core/contracts/wallet');
    return {
        ...actual,
        connectWallet: vi.fn(),
        disconnectWallet: vi.fn(),
        reconnectWallet: vi.fn(),
        getWalletAccount: vi.fn(),
        watchWalletAccount: vi.fn(),
        getNativeBalance: vi.fn(),
        // Configured network is testnet; treat testnet + public as supported so
        // we can exercise both the mainnet path and a genuine wrong-network.
        isSupportedNetwork: vi.fn((p?: string) => p === TESTNET || p === PUBLIC),
        getConfiguredNetworkName: vi.fn(() => 'Testnet'),
    };
});

import { walletStore } from './walletStore.svelte';
import {
    connectWallet,
    disconnectWallet,
    getNativeBalance,
    reconnectWallet,
    watchWalletAccount,
} from '@zarf/core/contracts/wallet';

const mockConnect = vi.mocked(connectWallet);
const mockDisconnect = vi.mocked(disconnectWallet);
const mockBalance = vi.mocked(getNativeBalance);
const mockReconnect = vi.mocked(reconnectWallet);
const mockWatch = vi.mocked(watchWalletAccount);

function bal(value: bigint, spendable = value, reserved = 0n) {
    return { value, reserved, spendable, formatted: '0', symbol: 'XLM' };
}

beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockConnect.mockReset();
    mockBalance.mockReset().mockResolvedValue(bal(0n));
    mockDisconnect.mockReset().mockResolvedValue(undefined);
    mockReconnect.mockReset().mockResolvedValue(undefined);
    mockWatch.mockReset().mockResolvedValue(() => {});
    // Reset the singleton store to a clean disconnected state.
    await walletStore.disconnect();
    walletStore.closeModal();
    walletStore.clearError();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('walletStore — disconnected', () => {
    it('starts disconnected with no balance and a configured-network label', () => {
        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.address).toBeNull();
        expect(walletStore.balance).toBeNull();
        expect(walletStore.formattedBalance).toBeNull();
        expect(walletStore.isMainnet).toBe(false);
        expect(walletStore.isWrongNetwork).toBe(false);
        expect(walletStore.networkName).toBe('Testnet');
    });
});

describe('walletStore.connect', () => {
    it('connects on testnet and exposes exact total + spendable balance', async () => {
        mockConnect.mockResolvedValue({
            address: 'GDADDR',
            network: 'TESTNET',
            networkPassphrase: TESTNET,
        });
        mockBalance.mockResolvedValue(bal(100_000_000_000n, 99_990_000_000n, 10_000_000n));

        await walletStore.connect();

        expect(walletStore.isConnected).toBe(true);
        expect(walletStore.address).toBe('GDADDR');
        expect(walletStore.networkName).toBe('TESTNET');
        expect(walletStore.isMainnet).toBe(false);
        expect(walletStore.isWrongNetwork).toBe(false);
        expect(walletStore.isConnecting).toBe(false);

        await vi.waitFor(() => expect(walletStore.formattedBalance).toBe('10000.0000 XLM'));
        expect(walletStore.spendableBalance).toBe('9999.0000 XLM');
        expect(walletStore.hasReserve).toBe(true);
    });

    it('labels a public-passphrase connection MAINNET, trusting the passphrase', async () => {
        mockConnect.mockResolvedValue({
            address: 'GMAIN',
            network: 'i-claim-to-be-testnet',
            networkPassphrase: PUBLIC,
        });
        await walletStore.connect();
        expect(walletStore.isMainnet).toBe(true);
        expect(walletStore.networkName).toBe('MAINNET');
    });

    it('flags a wrong network and refuses to show its balance', async () => {
        mockConnect.mockResolvedValue({
            address: 'GFUT',
            network: 'FUTURENET',
            networkPassphrase: FUTURENET,
        });
        mockBalance.mockResolvedValue(bal(50_000_000n));
        await walletStore.connect();

        expect(walletStore.isWrongNetwork).toBe(true);
        await new Promise((r) => setTimeout(r, 0));
        expect(mockBalance).not.toHaveBeenCalled();
        expect(walletStore.balance).toBeNull();
        expect(walletStore.formattedBalance).toBeNull();
    });

    it('sanitizes and rethrows a connection failure, leaving a clean state', async () => {
        mockConnect.mockRejectedValue(new Error('User rejected the request'));
        await expect(walletStore.connect()).rejects.toThrow();
        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.isConnecting).toBe(false);
        expect(walletStore.error).toBe('Request rejected. Please try again when ready.');
    });
});

describe('walletStore.refreshBalance', () => {
    it('records a balanceError (without throwing) when Horizon fails', async () => {
        mockConnect.mockResolvedValue({
            address: 'GDADDR',
            network: 'TESTNET',
            networkPassphrase: TESTNET,
        });
        mockBalance.mockRejectedValue(new Error('horizon 500'));

        await walletStore.connect();

        await vi.waitFor(() => expect(walletStore.balanceError).toBe(true));
        expect(walletStore.balance).toBeNull();
        expect(walletStore.formattedBalance).toBeNull();
    });
});

describe('walletStore.disconnect / modal', () => {
    it('clears connection state on disconnect', async () => {
        mockConnect.mockResolvedValue({
            address: 'GDADDR',
            network: 'TESTNET',
            networkPassphrase: TESTNET,
        });
        mockBalance.mockResolvedValue(bal(100_000_000_000n));
        await walletStore.connect();
        await vi.waitFor(() => expect(walletStore.formattedBalance).not.toBeNull());

        await walletStore.disconnect();

        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.address).toBeNull();
        expect(walletStore.balance).toBeNull();
    });

    it('openModal opens (and clears errors); closeModal closes', () => {
        walletStore.openModal();
        expect(walletStore.isModalOpen).toBe(true);
        walletStore.closeModal();
        expect(walletStore.isModalOpen).toBe(false);
    });
});

describe('walletStore.shortAddress', () => {
    it('truncates the connected address', async () => {
        mockConnect.mockResolvedValue({
            address: 'GD7CWARMCNDW4IMEJSDVIOK6JYQYOESFVSFOETF3VJYUUKWLHUUBHF2R',
            network: 'TESTNET',
            networkPassphrase: TESTNET,
        });
        await walletStore.connect();
        expect(walletStore.shortAddress).toBe('GD7CWA...UBHF2R');
    });
});
