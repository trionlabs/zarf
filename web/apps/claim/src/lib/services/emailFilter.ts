/**
 * Email Filter Service
 *
 * Filters distributions based on user's email eligibility.
 * Uses Pedersen hashing to match against emailHashes in distribution JSON.
 *
 * @module services/emailFilter
 */

import { hashEmail } from '@zarf/core/utils/email';
import type { Address } from 'viem';

/**
 * Distribution data structure with optional emailHashes
 */
interface DistributionWithHashes {
    emailHashes?: string[];
    [key: string]: unknown;
}

/**
 * Compute Pedersen hash of user's email.
 * Re-export of core utility for convenience.
 */
export const computeUserEmailHash = hashEmail;

/**
 * Check if a user's email hash exists in a distribution's emailHashes array.
 *
 * @param address - Contract address (lowercase)
 * @param userEmailHash - Pre-computed hash of user's email
 * @returns true if email is in the distribution, false otherwise
 */
export async function isEmailInDistribution(
    address: string,
    userEmailHash: string
): Promise<boolean> {
    try {
        const response = await fetch(
            `/distributions/${address.toLowerCase()}.json`
        );

        if (!response.ok) {
            console.warn(`[EmailFilter] Distribution not found: ${address}`);
            return false;
        }

        const data: DistributionWithHashes = await response.json();

        // Backward compatibility: no emailHashes means visible to everyone
        if (!data.emailHashes || !Array.isArray(data.emailHashes)) {
            return true;
        }

        // Normalize hashes for comparison (ensure consistent 0x prefix and lowercase)
        const normalizedUserHash = userEmailHash.toLowerCase();
        const normalizedDistHashes = data.emailHashes.map((h) =>
            h.toLowerCase()
        );

        return normalizedDistHashes.includes(normalizedUserHash);
    } catch (error) {
        console.error(`[EmailFilter] Error checking distribution:`, error);
        // On error, default to showing (fail open for UX)
        return true;
    }
}

/**
 * Filter a list of distribution addresses to only those where
 * the user's email has an allocation.
 *
 * @param addresses - Array of contract addresses to filter
 * @param email - User's email address
 * @returns Filtered array of addresses where user is eligible
 */
export async function filterDistributionsByEmail(
    addresses: Address[],
    email: string
): Promise<Address[]> {
    // No email = no distributions (security: don't leak distribution list)
    if (!email) {
        return [];
    }

    if (addresses.length === 0) {
        return [];
    }

    // Compute user's email hash once
    const userEmailHash = await computeUserEmailHash(email);

    // Check each distribution in parallel
    const results = await Promise.all(
        addresses.map(async (addr) => {
            const isEligible = await isEmailInDistribution(addr, userEmailHash);
            return { address: addr, eligible: isEligible };
        })
    );

    // Return only eligible addresses
    return results
        .filter((r) => r.eligible)
        .map((r) => r.address);
}
