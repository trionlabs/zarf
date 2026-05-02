/**
 * Recovery flow for an interrupted deploy.
 *
 * On page reload mid-deploy, the store has either an `approveTxHash` or a
 * `createTxHash` (or both) persisted as a write-ahead log. This module
 * decides what state to resume into by checking on-chain receipts.
 *
 * Wagmi-bound concerns are injected as `WaitForReceipt` so the function
 * is testable with a fake. Component just dispatches on the discriminated
 * result.
 *
 * @module domain/deployRecovery
 */

import type { Address, Hash, TransactionReceipt } from 'viem';

export type WaitForReceipt = (hash: Hash) => Promise<TransactionReceipt>;

export type ParseVestingAddress = (receipt: TransactionReceipt) => Address;

function toError(value: unknown): Error {
    if (value instanceof Error) return value;
    if (typeof value === 'string') return new Error(value);
    try {
        return new Error(JSON.stringify(value));
    } catch {
        return new Error(String(value));
    }
}

export type RecoveryResult =
    /** No pending tx hashes; nothing to recover. */
    | { kind: 'none' }
    /** create-tx receipt was confirmed; the vesting contract address was parsed from the logs. */
    | { kind: 'createConfirmed'; vestingAddress: Address; transactionHash: Hash }
    /** create-tx receipt confirmed but the address could not be parsed (caller should still mark complete). */
    | { kind: 'createConfirmedNoAddress'; transactionHash: Hash }
    /** create-tx reverted on-chain. */
    | { kind: 'createReverted' }
    /** approve-tx confirmed; ready to resume to the create step (idle). */
    | { kind: 'approveConfirmed' }
    /** approve-tx reverted on-chain. */
    | { kind: 'approveReverted' }
    /** RPC error (timeout, network); caller decides retry. */
    | { kind: 'rpcError'; pending: 'create' | 'approve'; error: Error };

export interface PendingHashes {
    approveTxHash: Hash | null;
    createTxHash: Hash | null;
}

/**
 * Resolve a pending deploy.
 *
 * Priority: a `createTxHash` always wins over `approveTxHash` — the create
 * step is the second of the two-tx flow, so its presence implies approve
 * already succeeded. We do NOT re-verify approve in that case.
 */
export async function recoverPendingDeploy(
    pending: PendingHashes,
    deps: {
        waitForReceipt: WaitForReceipt;
        parseVestingAddress: ParseVestingAddress;
    },
): Promise<RecoveryResult> {
    if (pending.createTxHash) {
        let receipt: TransactionReceipt;
        try {
            receipt = await deps.waitForReceipt(pending.createTxHash);
        } catch (e) {
            return { kind: 'rpcError', pending: 'create', error: toError(e) };
        }
        if (receipt.status !== 'success') {
            return { kind: 'createReverted' };
        }
        try {
            const vestingAddress = deps.parseVestingAddress(receipt);
            return { kind: 'createConfirmed', vestingAddress, transactionHash: receipt.transactionHash };
        } catch {
            return { kind: 'createConfirmedNoAddress', transactionHash: receipt.transactionHash };
        }
    }

    if (pending.approveTxHash) {
        let receipt: TransactionReceipt;
        try {
            receipt = await deps.waitForReceipt(pending.approveTxHash);
        } catch (e) {
            return { kind: 'rpcError', pending: 'approve', error: toError(e) };
        }
        return receipt.status === 'success' ? { kind: 'approveConfirmed' } : { kind: 'approveReverted' };
    }

    return { kind: 'none' };
}
