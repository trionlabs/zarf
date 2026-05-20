<script lang="ts">
    import type { Distribution, TokenDetails } from "../../../stores/types";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import ZenBadge from "@zarf/ui/components/ui/ZenBadge.svelte";

    interface Props {
        distribution: Distribution;
        tokenDetails: TokenDetails;
        recipientCount: number;
        batchCount: number;
    }

    let { distribution, tokenDetails, recipientCount, batchCount }: Props = $props();
</script>

<ZenCard variant="elevated" class="overflow-hidden sticky top-8">
    <div>
        <div
            class="p-4 bg-zen-bg-elevated border-b border-zen-border-subtle flex justify-between items-center"
        >
            <h3
                class="font-bold text-sm uppercase tracking-wider text-zen-fg-subtle"
            >
                Deployment Summary
            </h3>
            <ZenBadge variant="default" size="sm">
                ID: {distribution.id.slice(0, 8)}
            </ZenBadge>
        </div>
        <div class="p-6 grid grid-cols-1 gap-6">
            <!-- Token Info -->
            <div>
                <div
                    class="text-xs font-semibold uppercase text-zen-fg-subtle mb-1"
                >
                    Asset
                </div>
                <div class="flex items-center gap-2">
                    <div
                        class="w-8 h-8 rounded-full bg-zen-primary-muted flex items-center justify-center text-zen-primary font-bold text-xs"
                    >
                        {tokenDetails.tokenSymbol?.charAt(0) ?? "?"}
                    </div>
                    <div>
                        <div class="font-bold text-lg">
                            {tokenDetails.tokenSymbol}
                        </div>
                        <div
                            class="text-xs font-mono text-zen-fg-subtle truncate w-32"
                        >
                            {tokenDetails.tokenAddress}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Total Amount -->
            <div>
                <div
                    class="text-xs font-semibold uppercase text-zen-fg-subtle mb-1"
                >
                    Total Allocation
                </div>
                <div class="font-mono text-xl font-bold">
                    {Number(distribution.amount).toLocaleString()}
                    <span
                        class="text-sm font-normal text-zen-fg-subtle"
                        >{tokenDetails.tokenSymbol}</span
                    >
                </div>
                <div class="text-xs text-zen-fg-subtle">
                    {recipientCount} {recipientCount === 1 ? "Recipient" : "Recipients"}
                    {#if batchCount !== recipientCount}
                        ({batchCount} batches)
                    {/if}
                </div>
            </div>

            <!-- Schedule -->
            <div class="border-t border-zen-border-subtle pt-4 mt-2">
                <div
                    class="text-xs font-semibold uppercase text-zen-fg-subtle mb-3"
                >
                    Vesting Schedule ({distribution.schedule.durationUnit})
                </div>
                <div class="grid grid-cols-1 gap-4">
                    <div class="flex justify-between">
                        <div class="text-[10px] text-zen-fg-subtle uppercase">
                            Cliff Date
                        </div>
                        <div class="font-medium text-sm">
                            {distribution.schedule.cliffEndDate
                                ? new Date(
                                      distribution.schedule.cliffEndDate,
                                  ).toLocaleDateString()
                                : "None"}
                        </div>
                    </div>
                    <div class="flex justify-between">
                        <div class="text-[10px] text-zen-fg-subtle uppercase">
                            Duration
                        </div>
                        <div class="font-medium text-sm">
                            {distribution.schedule.distributionDuration}
                            {distribution.schedule.durationUnit}s
                        </div>
                    </div>
                    <div class="flex justify-between">
                        <div class="text-[10px] text-zen-fg-subtle uppercase">
                            Unlock Frequency
                        </div>
                        <div class="font-medium text-sm">
                            Every 1 {distribution.schedule.durationUnit}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</ZenCard>
