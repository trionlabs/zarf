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

export interface StellarBalance {
    value: bigint;
    formatted: string;
    symbol: string;
}

interface HorizonAccountResponse {
    balances?: Array<{
        asset_type?: string;
        balance?: string;
    }>;
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

function assertBrowser(): void {
    if (!browser) {
        throw new Error('Cannot connect Stellar wallet during SSR');
    }
}

function normalizeNetworkName(name?: string, passphrase?: string): string {
    if (name) return name;
    if (passphrase === 'Public Global Stellar Network ; September 2015') return 'PUBLIC';
    if (passphrase === 'Test SDF Network ; September 2015') return 'TESTNET';
    if (passphrase === 'Test SDF Future Network ; October 2022') return 'FUTURENET';
    return 'CUSTOM';
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
    if (connected.error) throw new Error(freighterErrorMessage(connected.error));
    if (!connected.isConnected) {
        throw new Error('No Stellar wallet detected. Please install Freighter.');
    }

    const access = await fr.requestAccess();
    if (access.error) throw new Error(freighterErrorMessage(access.error));
    if (!access.address) throw new Error('Freighter did not return a Stellar address.');

    const network = await fr.getNetworkDetails();
    if (network.error) throw new Error(freighterErrorMessage(network.error));

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

export async function switchChain(): Promise<void> {
    throw new Error(
        'Network changes are handled in Freighter. Select the configured Stellar network there.',
    );
}

export async function getNativeBalance(address: StellarAddress): Promise<StellarBalance> {
    const cfg = getStellarConfig();
    if (!cfg.horizonUrl) throw new Error('Missing Stellar Horizon URL');

    const url = new URL(`/accounts/${address}`, cfg.horizonUrl);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch Stellar account balance: ${res.status}`);

    const json = (await res.json()) as HorizonAccountResponse;
    const native = json.balances?.find((balance) => balance.asset_type === 'native');
    const formatted = native?.balance ?? '0';

    return {
        value: BigInt(Math.trunc(Number(formatted) * 10_000_000)),
        formatted,
        symbol: 'XLM',
    };
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

    if (result.error) throw new Error(freighterErrorMessage(result.error));
    if (!result.signedTxXdr) throw new Error('Freighter did not return a signed transaction.');
    return result.signedTxXdr;
}
