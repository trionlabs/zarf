// Explorer URL formatters. Pure-string helpers that read only
// `explorerBaseUrl` from the runtime Stellar config — deliberately no
// `@stellar/stellar-sdk` imports. Splitting these out of contracts.ts lets
// callers (e.g. walletStore in the root layout closure) pull the helpers
// without dragging the SDK into their static graph.

import { getStellarConfig } from '../config/runtime';
import type { StellarAddress, StellarContractId, TransactionHash } from '../types';

function explorerBase(): string {
    const base = getStellarConfig().explorerBaseUrl;
    if (!base) throw new Error('Missing Stellar explorer URL');
    return base.replace(/\/$/, '');
}

export function getExplorerUrl(hash: TransactionHash): string {
    return `${explorerBase()}/tx/${hash}`;
}

export function getAccountExplorerUrl(address: StellarAddress): string {
    return `${explorerBase()}/account/${address}`;
}

export function getContractExplorerUrl(address: StellarContractId): string {
    return `${explorerBase()}/contract/${address}`;
}
