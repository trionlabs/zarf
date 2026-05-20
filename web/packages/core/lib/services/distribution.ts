/**
 * Distribution Data Service
 *
 * Fetches static distribution data (commitments, schedule) required for
 * Off-Chain Discovery (Discrete Vesting).
 *
 * @module services/distribution
 */

import type { StellarContractId } from '../types';
import { getCidForVesting } from './vestingDiscovery';
import { fetchIpfsJson } from '../utils/ipfsFetch';
import { err } from '../utils/log';

export interface EpochMetadata {
    /** BigInt as string (JSON restriction) */
    amount: string;
    /** Unix timestamp (seconds) */
    unlockTime: number;
    /** Leaf index in the Merkle Tree */
    index: number;
}

export type CommitmentMetadata = EpochMetadata | EpochMetadata[];

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
    commitments: Record<string, CommitmentMetadata>;
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
 * - `commitments` is fully validated before returning. IPFS documents are
 *   untrusted, and downstream discovery code relies on this schema.
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
    const validateMetadata = (key: string, value: unknown, suffix = ''): void => {
        if (typeof value !== 'object' || value === null) {
            throw new Error(`distribution: commitments['${key}']${suffix} is not an object`);
        }
        const m = value as Record<string, unknown>;
        if (typeof m.amount !== 'string') {
            throw new Error(`distribution: commitments['${key}']${suffix}.amount must be a string`);
        }
        try {
            BigInt(m.amount);
        } catch {
            throw new Error(`distribution: commitments['${key}']${suffix}.amount must be a bigint string`);
        }
        if (typeof m.unlockTime !== 'number' || !Number.isFinite(m.unlockTime)) {
            throw new Error(`distribution: commitments['${key}']${suffix}.unlockTime must be a finite number`);
        }
        if (m.unlockTime < 0) {
            throw new Error(`distribution: commitments['${key}']${suffix}.unlockTime must be non-negative`);
        }
        if (typeof m.index !== 'number' || !Number.isInteger(m.index) || m.index < 0) {
            throw new Error(`distribution: commitments['${key}']${suffix}.index must be a non-negative integer`);
        }
    };

    const commitments = d.commitments as Record<string, unknown>;
    for (const [key, value] of Object.entries(commitments)) {
        if (Array.isArray(value)) {
            if (value.length === 0) {
                throw new Error(`distribution: commitments['${key}'] array must not be empty`);
            }
            value.forEach((entry, index) => validateMetadata(key, entry, `[${index}]`));
        } else {
            validateMetadata(key, value);
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
    const cid = await getCidForVesting(address as StellarContractId);
    if (!cid) {
        throw new Error(`No metadata CID registered for vesting ${address}`);
    }

    try {
        const raw = await fetchIpfsJson(cid);
        return validateDistributionData(raw);
    } catch (error) {
        err('[Distribution] Failed to fetch data:', error);
        throw error;
    }
}
