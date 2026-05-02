/**
 * Merkle result → factory deploy input adapter.
 *
 * The merkle worker emits `MerkleClaim[]` (typed by `@zarf/core/types`).
 * The Soroban factory needs:
 *   merkleRoot:      32-byte 0x-prefixed field
 *   recipientCount:  number of generated claim leaves
 *   totalAmount:     token amount in the token's base unit
 *
 * This adapter performs the conversion and validates each claim before the
 * user sees a wallet confirm dialog.
 *
 * @module domain/merkleResultAdapter
 */

import type { HexString } from '../types';
import type { MerkleClaim } from '../types';

/**
 * Convert a merkle claim's `identityCommitment` hex string to the 32-byte,
 * 0x-prefixed field shape.
 *
 * @throws if the commitment is missing, not a string, or not valid hex.
 */
export function commitmentToHash(commitment: unknown): HexString {
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
    return `0x${stripped.padStart(64, '0').toLowerCase()}` as HexString;
}

/** Same conversion for the merkle root. */
export function rootToHash(root: bigint): HexString {
    if (root < 0n) {
        throw new RangeError(`merkle root: must be non-negative (got ${root})`);
    }
    if (root > (1n << 256n) - 1n) {
        throw new RangeError('merkle root: must fit in 32 bytes');
    }
    const hex = root.toString(16);
    return `0x${hex.padStart(64, '0').toLowerCase()}` as HexString;
}

export interface FactoryDeployInputs {
    merkleRoot: HexString;
    recipientCount: number;
    /** Sum of `amounts` — provided for the integrity check in the caller. */
    totalAllocation: bigint;
}

/**
 * Convert a full merkle result (claims + root) into the Soroban factory
 * inputs. Validates every claim before deployment.
 */
export function buildFactoryDeployInputs(
    claims: ReadonlyArray<MerkleClaim>,
    root: bigint,
): FactoryDeployInputs {
    if (claims.length === 0) {
        throw new Error('merkle result: empty claims (cannot deploy a distribution with no recipients)');
    }
    let total = 0n;

    for (let i = 0; i < claims.length; i++) {
        const c = claims[i];
        try {
            commitmentToHash(c.identityCommitment);
        } catch (e) {
            throw new Error(`merkle claim #${i} (leafIndex=${c.leafIndex ?? '?'}): ${(e as Error).message}`);
        }
        if (typeof c.amount !== 'bigint' || c.amount <= 0n) {
            throw new Error(`merkle claim #${i}: amount must be a positive bigint (got ${typeof c.amount} ${c.amount})`);
        }
        total += c.amount;
    }

    return {
        merkleRoot: rootToHash(root),
        recipientCount: claims.length,
        totalAllocation: total,
    };
}
