/**
 * Distribution Data Service
 * 
 * Fetches static distribution data (leaves, schedule) required for 
 * Off-Chain Discovery (Discrete Vesting).
 * 
 * @module services/distribution
 */

import { type Address } from 'viem';

export interface EpochMetadata {
    amount: string;     // BigInt as string (JSON restriction)
    unlockTime: number; // Unix timestamp
    index: number;      // Leaf index in the Merkle Tree
}

export interface DistributionData {
    merkleRoot: string;
    schedule: {
        vestingStart: number;
        cliffDuration: number;
        vestingDuration: number;
        vestingPeriod: number;
    };
    // Map of IdentityCommitment (Hex) -> Metadata
    // This allows O(1) lookup during the brute-force discovery loop
    commitments: Record<string, EpochMetadata>;
    leaves?: string[]; // Optional: list of all leaf hashes for audit
}

/**
 * Fetch distribution data for a specific contract.
 * Expects a JSON file at `/distributions/<address>.json`.
 * 
 * @param address - The vesting contract address
 */
export async function fetchDistributionData(address: string): Promise<DistributionData> {
    // Normalize address to lowercase for file lookup
    const filename = `/distributions/${address.toLowerCase()}.json`;

    try {
        const response = await fetch(filename);
        if (!response.ok) {
            throw new Error(`Distribution data not found: ${response.statusText}`);
        }

        const data = await response.json();

        // Basic validation
        if (!data.commitments || typeof data.commitments !== 'object') {
            throw new Error('Invalid distribution data: missing commitments map');
        }

        // Optional legacy check (can remove if strict optimization desired, but keeping for safety)
        if (data.leaves && !Array.isArray(data.leaves)) {
            console.warn('Distribution data has invalid leaves array');
        }

        if (!data.schedule) {
            throw new Error('Invalid distribution data: missing schedule');
        }

        return data as DistributionData;
    } catch (error) {
        console.error('[Distribution] Failed to fetch data:', error);
        throw error;
    }
}
