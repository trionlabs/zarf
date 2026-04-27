/**
 * Re-export of the shared discovery service from @zarf/core.
 * The implementation lives in packages/core/lib/services/distributionDiscovery.ts;
 * keep app-specific overrides (if any) in this file, not the core copy.
 */
export {
    type OnChainVestingContract,
    type DiscoveryResult,
    type DiscoveryError,
    invalidateCache,
    addOptimisticContract,
    fetchOwnerDeploymentAddresses,
    sanitizeString,
    fetchContractMetadata,
    discoverOwnerVestings,
    getOwnerDeploymentCount,
} from '@zarf/core/services/distributionDiscovery';
