import { describe, expect, it, vi } from 'vitest';
import type { Address, Hash, TransactionReceipt } from 'viem';
import { recoverPendingDeploy } from './deployRecovery';

const VESTING_ADDR = '0xabc' as Address;
const HASH_A = '0xa' as Hash;
const HASH_C = '0xc' as Hash;

const fakeReceipt = (status: 'success' | 'reverted'): TransactionReceipt => ({
    status,
    transactionHash: HASH_C,
} as unknown as TransactionReceipt);

const parseOk = vi.fn().mockReturnValue(VESTING_ADDR);
const parseThrow = vi.fn().mockImplementation(() => { throw new Error('no log'); });

describe('recoverPendingDeploy', () => {
    it('returns "none" when there are no pending hashes', async () => {
        const out = await recoverPendingDeploy(
            { approveTxHash: null, createTxHash: null },
            { waitForReceipt: vi.fn(), parseVestingAddress: parseOk },
        );
        expect(out).toEqual({ kind: 'none' });
    });

    it('"createConfirmed" with the parsed vesting address when create-tx succeeded', async () => {
        const out = await recoverPendingDeploy(
            { approveTxHash: null, createTxHash: HASH_C },
            { waitForReceipt: async () => fakeReceipt('success'), parseVestingAddress: parseOk },
        );
        expect(out).toEqual({ kind: 'createConfirmed', vestingAddress: VESTING_ADDR, transactionHash: HASH_C });
    });

    it('"createConfirmedNoAddress" when receipt is success but log parsing throws', async () => {
        const out = await recoverPendingDeploy(
            { approveTxHash: null, createTxHash: HASH_C },
            { waitForReceipt: async () => fakeReceipt('success'), parseVestingAddress: parseThrow },
        );
        expect(out).toEqual({ kind: 'createConfirmedNoAddress', transactionHash: HASH_C });
    });

    it('"createReverted" when create-tx reverted on-chain', async () => {
        const out = await recoverPendingDeploy(
            { approveTxHash: null, createTxHash: HASH_C },
            { waitForReceipt: async () => fakeReceipt('reverted'), parseVestingAddress: parseOk },
        );
        expect(out).toEqual({ kind: 'createReverted' });
    });

    it('"approveConfirmed" / "approveReverted" mirrored for the approve-only path', async () => {
        const ok = await recoverPendingDeploy(
            { approveTxHash: HASH_A, createTxHash: null },
            { waitForReceipt: async () => fakeReceipt('success'), parseVestingAddress: parseOk },
        );
        expect(ok).toEqual({ kind: 'approveConfirmed' });

        const bad = await recoverPendingDeploy(
            { approveTxHash: HASH_A, createTxHash: null },
            { waitForReceipt: async () => fakeReceipt('reverted'), parseVestingAddress: parseOk },
        );
        expect(bad).toEqual({ kind: 'approveReverted' });
    });

    it('"rpcError" surfaces the underlying exception (caller decides retry)', async () => {
        const err = new Error('RPC down');
        const out = await recoverPendingDeploy(
            { approveTxHash: null, createTxHash: HASH_C },
            { waitForReceipt: async () => { throw err; }, parseVestingAddress: parseOk },
        );
        expect(out).toEqual({ kind: 'rpcError', pending: 'create', error: err });
    });

    it('createTxHash takes priority over approveTxHash (does NOT re-verify approve)', async () => {
        const wait = vi.fn().mockResolvedValue(fakeReceipt('success'));
        await recoverPendingDeploy(
            { approveTxHash: HASH_A, createTxHash: HASH_C },
            { waitForReceipt: wait, parseVestingAddress: parseOk },
        );
        expect(wait).toHaveBeenCalledTimes(1);
        expect(wait).toHaveBeenCalledWith(HASH_C);
    });
});
