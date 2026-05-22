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
import { getCidForVesting, type DiscoveredVesting } from '@zarf/core/services/vestingDiscovery';
import { fetchIpfsJson, IpfsFetchError } from '@zarf/core/utils/ipfsFetch';

type FilterableDistribution = StellarContractId | DiscoveredVesting;

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
    distribution: FilterableDistribution,
    userEmailHash: string,
): Promise<boolean> {
    const address = distributionAddress(distribution);
    try {
        const data = await fetchDistribution(distribution);
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
        const normalizedDistHashes = data.emailHashes.map((h) => h.toLowerCase());

        return normalizedDistHashes.includes(normalizedUserHash);
    } catch (error) {
        if (error instanceof IpfsFetchError) {
            console.warn(
                `[EmailFilter] Skipping distribution with unreadable IPFS metadata:`,
                error.message,
            );
            return false;
        }

        console.error(`[EmailFilter] Error checking distribution:`, error);
        // On non-IPFS errors, default to showing (fail open for UX).
        return true;
    }
}

function distributionAddress(distribution: FilterableDistribution): StellarContractId {
    return typeof distribution === 'string' ? distribution : distribution.address;
}

async function fetchDistribution(
    distribution: FilterableDistribution,
): Promise<DistributionWithHashes | null> {
    const cid =
        typeof distribution === 'string'
            ? await getCidForVesting(distribution as StellarContractId)
            : (distribution.metadataCid ?? (await getCidForVesting(distribution.address)));
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
    distributions: FilterableDistribution[],
    email: string,
): Promise<StellarContractId[]> {
    // No email = no distributions (security: don't leak distribution list)
    if (!email) {
        return [];
    }

    if (distributions.length === 0) {
        return [];
    }

    // Compute user's email hash once
    const userEmailHash = await computeUserEmailHash(email);

    // Check each distribution in parallel
    const results = await Promise.all(
        distributions.map(async (distribution) => {
            const address = distributionAddress(distribution);
            const isEligible = await isEmailInDistribution(distribution, userEmailHash);
            return { address, eligible: isEligible };
        }),
    );

    // Return only eligible addresses
    return results.filter((r) => r.eligible).map((r) => r.address);
}
