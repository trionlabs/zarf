/**
 * Stellar wallet utilities.
 *
 * Freighter owns browser wallet access and signing. Core keeps the small typed
 * wrapper so apps and UI do not import extension APIs directly.
 *
 * `@stellar/freighter-api` is dynamically imported so the stellar-vendor chunk
 * stays off the eager root-layout graph. Value imports here would pull the SDK
 * into the initial bundle via the walletStore → root-layout edge.
 */

import { browser } from '../utils/ssr';
import type { WatchWalletChanges } from '@stellar/freighter-api';
import { getStellarConfig } from '../config/runtime';
import type { StellarAddress, WalletAccount, WalletConnection } from '../types';
import { xlmToStroops, computeReserveStroops } from './balance';

export interface StellarBalance {
    /** Total native balance in stroops (exact; 1 XLM = 10^7 stroops). */
    value: bigint;
    /** Protocol-reserved, non-spendable stroops (base reserve + subentries). */
    reserved: bigint;
    /** Spendable stroops = max(0, value − reserved). */
    spendable: bigint;
    /** Raw Horizon decimal-XLM string, full precision. */
    formatted: string;
    symbol: string;
}

interface HorizonAccountResponse {
    balances?: Array<{
        asset_type?: string;
        balance?: string;
    }>;
    subentry_count?: number;
    num_sponsoring?: number;
    num_sponsored?: number;
}

let watcher: InstanceType<typeof WatchWalletChanges> | null = null;
let freighterPromise: Promise<typeof import('@stellar/freighter-api')> | null = null;

function loadFreighter(): Promise<typeof import('@stellar/freighter-api')> {
    if (!freighterPromise) {
        freighterPromise = import('@stellar/freighter-api');
    }
    return freighterPromise;
}

function freighterErrorMessage(error: unknown): string {
    if (!error) return 'Freighter request failed';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    const maybe = error as { message?: string; error?: string };
    return maybe.message || maybe.error || 'Freighter request failed';
}

/**
 * Build an Error from a Freighter error, PRESERVING its numeric `code`. Throwing
 * a bare `new Error(message)` discards the code, which downstream sanitizers use
 * (e.g. -32002 "request already pending") — so always throw via this helper.
 */
function freighterError(error: unknown): Error {
    const e = new Error(freighterErrorMessage(error)) as Error & { code?: number };
    const code = (error as { code?: number } | null)?.code;
    if (typeof code === 'number') e.code = code;
    return e;
}

function assertBrowser(): void {
    if (!browser) {
        throw new Error('Cannot connect Stellar wallet during SSR');
    }
}

/** Canonical Stellar network passphrases. The passphrase — not the wallet's
 *  free-text network name — is the trusted identifier for any safety decision. */
export const STELLAR_PASSPHRASE = {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
    FUTURENET: 'Test SDF Future Network ; October 2022',
} as const;

/** Abort a Horizon balance request that hangs, so the UI never spins forever. */
const HORIZON_TIMEOUT_MS = 10_000;

function normalizeNetworkName(name?: string, passphrase?: string): string {
    if (name) return name;
    if (passphrase === STELLAR_PASSPHRASE.PUBLIC) return 'PUBLIC';
    if (passphrase === STELLAR_PASSPHRASE.TESTNET) return 'TESTNET';
    if (passphrase === STELLAR_PASSPHRASE.FUTURENET) return 'FUTURENET';
    return 'CUSTOM';
}

/** True only on Stellar mainnet (the PUBLIC network). Drives real-funds UI guards. */
export function isMainnetPassphrase(passphrase?: string | null): boolean {
    return passphrase === STELLAR_PASSPHRASE.PUBLIC;
}

/**
 * User-facing network label derived ONLY from the passphrase (the trusted
 * identifier), never from the wallet's self-reported network string. Returns
 * null when no passphrase is known (e.g. while disconnected).
 */
export function networkLabelFromPassphrase(passphrase?: string | null): string | null {
    if (!passphrase) return null;
    if (passphrase === STELLAR_PASSPHRASE.PUBLIC) return 'MAINNET';
    if (passphrase === STELLAR_PASSPHRASE.TESTNET) return 'TESTNET';
    if (passphrase === STELLAR_PASSPHRASE.FUTURENET) return 'FUTURENET';
    return 'UNKNOWN';
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

export function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function getConfiguredNetworkName(): string {
    const cfg = getStellarConfig();
    return normalizeNetworkName(cfg.networkName, cfg.networkPassphrase);
}

export function getChainName(): string {
    return getConfiguredNetworkName();
}

export function isSupportedNetwork(networkPassphrase?: string): boolean {
    return Boolean(networkPassphrase && networkPassphrase === getStellarConfig().networkPassphrase);
}

export async function connectWallet(): Promise<WalletConnection> {
    assertBrowser();
    const fr = await loadFreighter();

    const connected = await fr.isConnected();
    if (connected.error) throw freighterError(connected.error);
    if (!connected.isConnected) {
        throw new Error('No Stellar wallet detected. Please install Freighter.');
    }

    const access = await fr.requestAccess();
    if (access.error) throw freighterError(access.error);
    if (!access.address) throw new Error('Freighter did not return a Stellar address.');

    const network = await fr.getNetworkDetails();
    if (network.error) throw freighterError(network.error);

    return {
        address: access.address,
        network: network.network || getConfiguredNetworkName(),
        networkPassphrase: network.networkPassphrase,
    };
}

export async function disconnectWallet(): Promise<void> {
    stopWatcher();
}

export async function reconnectWallet(): Promise<void> {
    if (!browser) return;
    await getWalletAccount();
}

export async function getNativeBalance(address: StellarAddress): Promise<StellarBalance> {
    const cfg = getStellarConfig();
    if (!cfg.horizonUrl) throw new Error('Missing Stellar Horizon URL');

    const url = new URL(`/accounts/${address}`, cfg.horizonUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HORIZON_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }

    // A brand-new / unfunded account does not exist on the ledger yet → Horizon
    // returns 404. That is a real zero balance, not an error: report 0 XLM so a
    // fresh wallet shows a fundable account instead of spinning forever.
    if (res.status === 404) {
        return { value: 0n, reserved: 0n, spendable: 0n, formatted: '0', symbol: 'XLM' };
    }
    if (!res.ok) throw new Error(`Failed to fetch Stellar account balance: ${res.status}`);

    const json = (await res.json()) as HorizonAccountResponse;
    const native = json.balances?.find((balance) => balance.asset_type === 'native');
    const formatted = native?.balance ?? '0';

    // Exact, float-free stroop conversion; reserve from the account's subentry
    // profile so callers can show spendable vs. total.
    const value = xlmToStroops(formatted);
    const reserved = computeReserveStroops(
        json.subentry_count ?? 0,
        json.num_sponsoring ?? 0,
        json.num_sponsored ?? 0,
    );
    const spendable = value > reserved ? value - reserved : 0n;

    return { value, reserved, spendable, formatted, symbol: 'XLM' };
}

export async function getWalletAccount(): Promise<WalletAccount> {
    if (!browser) return { isConnected: false };
    const fr = await loadFreighter();

    const connected = await fr.isConnected();
    if (connected.error || !connected.isConnected) return { isConnected: false };

    const [address, network] = await Promise.all([fr.getAddress(), fr.getNetworkDetails()]);
    if (address.error || network.error || !address.address) {
        return { isConnected: false };
    }

    return {
        isConnected: true,
        address: address.address,
        network: network.network || getConfiguredNetworkName(),
        networkPassphrase: network.networkPassphrase,
    };
}

export async function watchWalletAccount(
    callback: (account: WalletAccount) => void,
): Promise<() => void> {
    if (!browser) return () => {};
    const fr = await loadFreighter();

    stopWatcher();
    watcher = new fr.WatchWalletChanges(1000);
    watcher.watch(({ address, network, networkPassphrase, error }) => {
        if (error || !address) {
            callback({ isConnected: false });
            return;
        }

        callback({
            isConnected: true,
            address,
            network,
            networkPassphrase,
        });
    });

    return stopWatcher;
}

function stopWatcher(): void {
    watcher?.stop();
    watcher = null;
}

export async function signTransaction(xdr: string, address: StellarAddress): Promise<string> {
    const cfg = getStellarConfig();
    const fr = await loadFreighter();
    const result = await fr.signTransaction(xdr, {
        address,
        networkPassphrase: cfg.networkPassphrase,
    });

    if (result.error) throw freighterError(result.error);
    if (!result.signedTxXdr) throw new Error('Freighter did not return a signed transaction.');
    return result.signedTxXdr;
}

export async function signMessage(message: string, address: StellarAddress): Promise<string> {
    assertBrowser();
    const cfg = getStellarConfig();
    const fr = await loadFreighter();
    const result = await fr.signMessage(message, {
        address,
        networkPassphrase: cfg.networkPassphrase,
    });

    if (result.error) throw freighterError(result.error);
    if (!result.signedMessage) throw new Error('Freighter did not return a signed message.');
    if (result.signerAddress && result.signerAddress !== address) {
        throw new Error('Freighter signed with a different Stellar address.');
    }

    return typeof result.signedMessage === 'string'
        ? result.signedMessage
        : bytesToBase64(result.signedMessage);
}

export {
    xlmToStroops,
    formatXlmAmount,
    computeReserveStroops,
    STROOPS_PER_XLM,
    BASE_RESERVE_STROOPS,
} from './balance';
