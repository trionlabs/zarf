/**
 * Email Filter Service
 *
 * Filters distributions based on user's email eligibility.
 * Uses Pedersen hashing to match against emailHashes in distribution JSON.
 *
 * @module services/emailFilter
 */

import { hashEmail } from '@zarf/core/utils/email';
import type { StellarContractId } from '@zarf/core/types';
import { getCidForVesting } from '@zarf/core/services/vestingDiscovery';
import { fetchIpfsJson } from '@zarf/core/utils/ipfsFetch';

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
        const data = await fetchDistribution(address);
        if (!data) {
            console.warn(`[EmailFilter] Distribution not found: ${address}`);
            return false;
        }

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

async function fetchDistribution(address: string): Promise<DistributionWithHashes | null> {
    const cid = await getCidForVesting(address as StellarContractId);
    if (!cid) return null;
    return await fetchIpfsJson<DistributionWithHashes>(cid);
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
    addresses: StellarContractId[],
    email: string
): Promise<StellarContractId[]> {
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
