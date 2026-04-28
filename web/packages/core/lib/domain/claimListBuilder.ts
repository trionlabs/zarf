/**
 * Claim list builder.
 *
 * Builds the off-chain JSON document that the claim app needs to construct
 * Merkle proofs and check eligibility. This document is pinned to IPFS and
 * its CID is emitted in the factory's VestingCreated event.
 *
 * Determinism is load-bearing: same input MUST produce byte-identical JSON,
 * because IPFS CIDs are content-addressed. Any non-determinism (Map iteration
 * order, BigInt rendering, key ordering) breaks "re-pin yields same CID".
 *
 * @module domain/claimListBuilder
 */

import type { MerkleClaim } from '../types';
import { hashEmail, normalizeEmail } from '../utils/email';

export interface ClaimListSchedule {
    vestingStart: number;
    cliffDuration: number;
    vestingDuration: number;
    vestingPeriod: number;
    totalPeriods: number;
}

export interface ClaimListJson {
    merkleRoot: string;
    schedule: ClaimListSchedule;
    leaves: string[];
    commitments: Record<string, { amount: string; unlockTime: number; index: number }>;
    emailHashes: string[];
}

export interface BuildClaimListInputs {
    claims: ReadonlyArray<MerkleClaim>;
    root: bigint;
    cliffSeconds: bigint;
    vestingSeconds: bigint;
    periodSeconds: bigint;
}

function bigintToHex32(n: bigint): string {
    return `0x${n.toString(16).padStart(64, '0')}`;
}

function normalizeCommitmentKey(c: string): string {
    const stripped = c.startsWith('0x') ? c.slice(2) : c;
    return `0x${stripped.padStart(64, '0').toLowerCase()}`;
}

/**
 * Pure builder — all heavy work (hashing) is awaited up-front, then the
 * object is assembled with stable insertion order for deterministic output.
 */
export async function buildClaimList(inputs: BuildClaimListInputs): Promise<ClaimListJson> {
    if (inputs.claims.length === 0) {
        throw new Error('buildClaimList: no claims');
    }

    const sortedByIndex = [...inputs.claims].sort((a, b) => a.leafIndex - b.leafIndex);

    const leaves: string[] = sortedByIndex.map((c) => bigintToHex32(c.leaf));

    const commitments: Record<string, { amount: string; unlockTime: number; index: number }> = {};
    for (const c of sortedByIndex) {
        commitments[normalizeCommitmentKey(c.identityCommitment)] = {
            amount: c.amount.toString(),
            unlockTime: c.unlockTime,
            index: c.leafIndex,
        };
    }

    const uniqueEmails = Array.from(new Set(sortedByIndex.map((c) => normalizeEmail(c.email))));
    const emailHashesUnsorted = await Promise.all(uniqueEmails.map((e) => hashEmail(e)));
    const emailHashes = emailHashesUnsorted.map((h) => h.toLowerCase()).sort();

    const minUnlock = Math.min(...sortedByIndex.map((c) => c.unlockTime));
    const totalPeriods =
        inputs.periodSeconds > 0n ? Number(inputs.vestingSeconds / inputs.periodSeconds) : 0;

    return {
        merkleRoot: bigintToHex32(inputs.root),
        schedule: {
            vestingStart: minUnlock,
            cliffDuration: Number(inputs.cliffSeconds),
            vestingDuration: Number(inputs.vestingSeconds),
            vestingPeriod: Number(inputs.periodSeconds),
            totalPeriods,
        },
        leaves,
        commitments,
        emailHashes,
    };
}

/**
 * Stable JSON serialization: keys are written in a fixed order so two builds
 * of the same logical content produce byte-identical output (and therefore
 * the same IPFS CID).
 */
export function serializeClaimList(doc: ClaimListJson): string {
    return JSON.stringify({
        merkleRoot: doc.merkleRoot,
        schedule: {
            vestingStart: doc.schedule.vestingStart,
            cliffDuration: doc.schedule.cliffDuration,
            vestingDuration: doc.schedule.vestingDuration,
            vestingPeriod: doc.schedule.vestingPeriod,
            totalPeriods: doc.schedule.totalPeriods,
        },
        leaves: doc.leaves,
        commitments: doc.commitments,
        emailHashes: doc.emailHashes,
    });
}
