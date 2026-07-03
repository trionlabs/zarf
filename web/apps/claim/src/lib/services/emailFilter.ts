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
import { fetchIpfsEmailHashes, fetchIpfsJson, IpfsFetchError } from '@zarf/core/utils/ipfsFetch';
import { warn, err } from '@zarf/core/utils/log';

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
        const cid = await resolveDistributionCid(distribution);
        if (!cid) {
            warn(`[EmailFilter] Distribution not found: ${address}`);
            return false;
        }

        const emailHashes = await fetchEmailHashes(cid);

        // Backward compatibility: no emailHashes means visible to everyone
        if (!emailHashes || !Array.isArray(emailHashes)) {
            return true;
        }

        // Normalize hashes for comparison (ensure consistent 0x prefix and lowercase)
        const normalizedUserHash = userEmailHash.toLowerCase();
        const normalizedDistHashes = emailHashes.map((h) => h.toLowerCase());

        return normalizedDistHashes.includes(normalizedUserHash);
    } catch (error) {
        if (error instanceof IpfsFetchError) {
            warn(
                `[EmailFilter] Skipping distribution with unreadable IPFS metadata:`,
                error.message,
            );
            return false;
        }

        err(`[EmailFilter] Error checking distribution:`, error);
        // On non-IPFS errors, default to showing (fail open for UX).
        return true;
    }
}

function distributionAddress(distribution: FilterableDistribution): StellarContractId {
    return typeof distribution === 'string' ? distribution : distribution.address;
}

async function resolveDistributionCid(
    distribution: FilterableDistribution,
): Promise<string | null> {
    return typeof distribution === 'string'
        ? await getCidForVesting(distribution as StellarContractId)
        : (distribution.metadataCid ?? (await getCidForVesting(distribution.address)));
}

// A freshly pinned CID can lag behind on public gateways for a few seconds,
// and `isEmailInDistribution` fails CLOSED on IPFS errors — without retries a
// just-deployed distribution would stay hidden until a full page reload.
const EMAIL_HASH_FETCH_ATTEMPTS = 3;
const EMAIL_HASH_RETRY_DELAYS_MS = [1_000, 2_500];

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Eligibility filtering only needs `emailHashes`, so prefer the indexer's
 * tiny extraction route over downloading the full distribution document
 * (which grows with recipients × epochs). Older indexer deployments lack
 * the route; fall back to the full document then.
 *
 * Transient failures (gateway propagation lag, indexer hiccup) are retried
 * with backoff before the caller's fail-closed policy hides the distribution.
 * Invalid CIDs are permanent and never retried. Throws the last error once
 * attempts are exhausted so the caller's open/closed classification holds.
 */
async function fetchEmailHashes(cid: string): Promise<string[] | null | undefined> {
    let lastError: unknown;
    for (let attempt = 0; attempt < EMAIL_HASH_FETCH_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            await sleep(EMAIL_HASH_RETRY_DELAYS_MS[attempt - 1] ?? 2_500);
        }
        try {
            return await fetchIpfsEmailHashes(cid);
        } catch {
            try {
                const data = await fetchIpfsJson<DistributionWithHashes>(cid);
                return data?.emailHashes;
            } catch (error) {
                lastError = error;
                if (error instanceof IpfsFetchError && error.code === 'INVALID_CID') break;
            }
        }
    }
    throw lastError;
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
