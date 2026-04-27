/**
 * Re-export of the shared distribution service from @zarf/core.
 * Implementation lives in packages/core/lib/services/distribution.ts.
 */
export {
    type EpochMetadata,
    type DistributionData,
    validateDistributionData,
    fetchDistributionData,
} from '@zarf/core/services/distribution';
