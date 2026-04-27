/**
 * Merkle result → factory deploy input adapter.
 *
 * The merkle worker emits `MerkleClaim[]` (typed by `@zarf/core/types`).
 * The factory's `create(...)` call expects parallel arrays:
 *   commitments: Hash[]   // 32-byte 0x-prefixed identity commitments
 *   amounts:     bigint[] // wei
 *
 * This adapter performs the conversion AND validates each claim, closing
 * the audit-T3 path where a malformed claim could fall through to a
 * `0x000…0` commitment being written to the contract.
 *
 * @module domain/merkleResultAdapter
 */

import type { Hash } from 'viem';
import type { MerkleClaim } from '../types';

/**
 * Convert a merkle claim's `identityCommitment` hex string to the 32-byte,
 * 0x-prefixed `Hash` shape the factory expects.
 *
 * @throws if the commitment is missing, not a string, or not valid hex.
 */
export function commitmentToHash(commitment: unknown): Hash {
    if (typeof commitment !== 'string' || commitment.length === 0) {
        throw new Error('merkle commitment: missing or non-string');
    }
    const stripped = commitment.startsWith('0x') ? commitment.slice(2) : commitment;
    if (stripped.length === 0 || !/^[a-fA-F0-9]+$/.test(stripped)) {
        throw new Error(`merkle commitment: not valid hex (got ${commitment})`);
    }
    if (stripped.length > 64) {
        throw new Error(`merkle commitment: > 32 bytes (got ${stripped.length / 2} bytes)`);
    }
    return `0x${stripped.padStart(64, '0').toLowerCase()}` as Hash;
}

/** Same conversion for the merkle root. */
export function rootToHash(root: bigint): Hash {
    const hex = root.toString(16);
    return `0x${hex.padStart(64, '0')}` as Hash;
}

export interface FactoryDeployInputs {
    commitments: Hash[];
    amounts: bigint[];
    merkleRoot: Hash;
    /** Sum of `amounts` — provided for the integrity check in the caller. */
    totalAllocation: bigint;
}

/**
 * Convert a full merkle result (claims + root) into the parallel-arrays
 * the factory needs. Validates every claim — any malformed entry throws
 * BEFORE the user sees a wallet confirm dialog.
 */
export function buildFactoryDeployInputs(
    claims: ReadonlyArray<MerkleClaim>,
    root: bigint,
): FactoryDeployInputs {
    if (claims.length === 0) {
        throw new Error('merkle result: empty claims (cannot deploy a distribution with no recipients)');
    }
    const commitments: Hash[] = [];
    const amounts: bigint[] = [];
    let total = 0n;

    for (let i = 0; i < claims.length; i++) {
        const c = claims[i];
        try {
            commitments.push(commitmentToHash(c.identityCommitment));
        } catch (e) {
            throw new Error(`merkle claim #${i} (leafIndex=${c.leafIndex ?? '?'}): ${(e as Error).message}`);
        }
        if (typeof c.amount !== 'bigint' || c.amount <= 0n) {
            throw new Error(`merkle claim #${i}: amount must be a positive bigint (got ${typeof c.amount} ${c.amount})`);
        }
        amounts.push(c.amount);
        total += c.amount;
    }

    return { commitments, amounts, merkleRoot: rootToHash(root), totalAllocation: total };
}
