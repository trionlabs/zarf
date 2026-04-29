/**
 * Distribution Data Service
 *
 * Fetches static distribution data (commitments, schedule) required for
 * Off-Chain Discovery (Discrete Vesting).
 *
 * @module services/distribution
 */

import type { Address } from 'viem';
import { getCidForVesting } from './vestingDiscovery';
import { fetchIpfsJson } from '../utils/ipfsFetch';

export interface EpochMetadata {
    /** BigInt as string (JSON restriction) */
    amount: string;
    /** Unix timestamp (seconds) */
    unlockTime: number;
    /** Leaf index in the Merkle Tree */
    index: number;
}

export interface DistributionData {
    /** Hex string '0x...' */
    merkleRoot: string;
    schedule: {
        vestingStart: number;
        cliffDuration: number;
        vestingDuration: number;
        vestingPeriod: number;
    };
    /**
     * Map of IdentityCommitment (hex) -> EpochMetadata.
     * Allows O(1) lookup during the brute-force discovery loop.
     */
    commitments: Record<string, EpochMetadata>;
    /** Optional list of all leaf hashes for audit / proof reconstruction */
    leaves?: string[];
    /** Optional list of email hashes for claim-side filtering (added in newer distributions) */
    emailHashes?: string[];
}

/**
 * Validate a parsed JSON value against the DistributionData schema.
 * Throws a descriptive `Error` on violation; on success the same object is
 * returned with the precise type.
 *
 * Design notes:
 * - Top-level shape (merkleRoot, schedule, commitments) is strictly enforced.
 * - `commitments` is spot-checked on a single entry rather than walked in
 *   full — distributions can have thousands of entries and full validation
 *   would dominate the discovery loop. The expensive check is in the brute-
 *   force discovery itself (each lookup must produce a well-typed entry).
 * - `leaves` and `emailHashes` are optional but, if present, must be arrays.
 */
export function validateDistributionData(raw: unknown): DistributionData {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`distribution: expected object, got ${typeof raw}`);
    }
    const d = raw as Record<string, unknown>;

    if (typeof d.merkleRoot !== 'string' || !d.merkleRoot.startsWith('0x')) {
        throw new Error('distribution: missing or invalid merkleRoot (must be 0x-prefixed hex string)');
    }

    if (typeof d.schedule !== 'object' || d.schedule === null) {
        throw new Error('distribution: missing schedule');
    }
    const s = d.schedule as Record<string, unknown>;
    for (const k of ['vestingStart', 'cliffDuration', 'vestingDuration', 'vestingPeriod'] as const) {
        const v = s[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new Error(`distribution: schedule.${k} must be a finite number`);
        }
    }

    if (typeof d.commitments !== 'object' || d.commitments === null) {
        throw new Error('distribution: missing commitments map');
    }
    const commitments = d.commitments as Record<string, unknown>;
    const sampleKey = Object.keys(commitments)[0];
    if (sampleKey !== undefined) {
        const sample = commitments[sampleKey];
        if (typeof sample !== 'object' || sample === null) {
            throw new Error(`distribution: commitments['${sampleKey}'] is not an object`);
        }
        const m = sample as Record<string, unknown>;
        if (typeof m.amount !== 'string') {
            throw new Error(`distribution: commitments['${sampleKey}'].amount must be a string`);
        }
        if (typeof m.unlockTime !== 'number' || !Number.isFinite(m.unlockTime)) {
            throw new Error(`distribution: commitments['${sampleKey}'].unlockTime must be a finite number`);
        }
        if (typeof m.index !== 'number' || !Number.isInteger(m.index)) {
            throw new Error(`distribution: commitments['${sampleKey}'].index must be an integer`);
        }
    }

    if (d.leaves !== undefined && !Array.isArray(d.leaves)) {
        throw new Error('distribution: leaves must be an array if present');
    }

    if (d.emailHashes !== undefined && !Array.isArray(d.emailHashes)) {
        throw new Error('distribution: emailHashes must be an array if present');
    }

    return d as unknown as DistributionData;
}

/**
 * Fetch distribution data for a specific vesting contract.
 *
 * Resolves the IPFS CID from the factory's `vestingMetadataCid(addr)` mapping
 * (set at deploy time), then fetches and validates the pinned JSON.
 *
 * @param address - The vesting contract address
 */
export async function fetchDistributionData(address: string): Promise<DistributionData> {
    const cid = await getCidForVesting(address as Address);
    if (!cid) {
        throw new Error(`No metadata CID registered for vesting ${address}`);
    }

    try {
        const raw = await fetchIpfsJson(cid);
        return validateDistributionData(raw);
    } catch (error) {
        console.error('[Distribution] Failed to fetch data:', error);
        throw error;
    }
}
