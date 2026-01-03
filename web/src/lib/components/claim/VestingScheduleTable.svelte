<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { formatUnits } from "viem";
    import { Check, Clock, Lock, ChevronDown, ChevronUp } from "lucide-svelte";

    // Format token amounts
    const format = (val: bigint) =>
        Number(formatUnits(val, 18)).toLocaleString(undefined, {
            maximumFractionDigits: 2,
        });

    // Format dates
    const formatDate = (ts: number) =>
        new Date(ts * 1000).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });

    // Calculate periods with their status
    type PeriodStatus = "claimed" | "claimable" | "locked";
    type VestingPeriod = {
        index: number;
        unlockDate: Date;
        amount: bigint;
        status: PeriodStatus;
        cumulativeAmount: bigint;
    };

    let periods = $derived.by(() => {
        if (!claimStore.vestingSchedule || claimStore.totalAllocation === 0n) {
            return [];
        }

        const info = claimStore.vestingSchedule;
        const total = claimStore.totalAllocation;
        const claimed = claimStore.claimedAmount;
        const now = Date.now() / 1000;

        const result: VestingPeriod[] = [];
        // Calculate total periods from duration / period length
        const totalPeriods = Math.floor(
            info.vestingDuration / info.vestingPeriod,
        );
        const amountPerPeriod = total / BigInt(totalPeriods);
        let runningClaimed = 0n;

        for (let i = 0; i < totalPeriods; i++) {
            // Period unlocks at: start + cliff + (i+1) * period
            // Because period 0 unlocks after 1 full period post-cliff
            const unlockTimestamp =
                info.vestingStart +
                info.cliffDuration +
                (i + 1) * info.vestingPeriod;
            const unlockDate = new Date(unlockTimestamp * 1000);

            // Determine status
            let status: PeriodStatus;
            const isPast = now >= unlockTimestamp;

            if (isPast) {
                // This period has unlocked
                runningClaimed += amountPerPeriod;
                if (runningClaimed <= claimed) {
                    status = "claimed";
                } else {
                    status = "claimable";
                }
            } else {
                status = "locked";
            }

            result.push({
                index: i + 1,
                unlockDate,
                amount: amountPerPeriod,
                status,
                cumulativeAmount: amountPerPeriod * BigInt(i + 1),
            });
        }

        return result;
    });

    // Collapsible state - show first 3 by default if many periods
    let isExpanded = $state(false);

    // Final UI-ready data transformation
    let displayPeriods = $derived.by(() => {
        const source =
            isExpanded || periods.length <= 4 ? periods : periods.slice(0, 3);
        return source.map((p) => ({
            ...p,
            formattedDate: formatDate(p.unlockDate.getTime() / 1000),
            formattedAmount: format(p.amount),
        }));
    });

    let hasMore = $derived(periods.length > 4);

    // Stats
    let claimedCount = $derived(
        periods.filter((p) => p.status === "claimed").length,
    );
    let claimableCount = $derived(
        periods.filter((p) => p.status === "claimable").length,
    );
    let lockedCount = $derived(
        periods.filter((p) => p.status === "locked").length,
    );
</script>

{#if periods.length > 0}
    <div class="space-y-4">
        <!-- Section Header -->
        <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-base-content/70">
                Unlock Schedule
            </h3>
            <div class="flex items-center gap-3 text-[10px]">
                {#if claimedCount > 0}
                    <span class="flex items-center gap-1 text-success">
                        <Check class="w-3 h-3" />
                        {claimedCount} claimed
                    </span>
                {/if}
                {#if claimableCount > 0}
                    <span class="flex items-center gap-1 text-primary">
                        <Clock class="w-3 h-3" />
                        {claimableCount} ready
                    </span>
                {/if}
                {#if lockedCount > 0}
                    <span class="flex items-center gap-1 text-base-content/40">
                        <Lock class="w-3 h-3" />
                        {lockedCount} locked
                    </span>
                {/if}
            </div>
        </div>

        <!-- Table -->
        <div class="overflow-hidden rounded-xl border border-base-content/5">
            <table class="table table-sm w-full">
                <thead>
                    <tr
                        class="bg-base-200/20 text-[10px] uppercase tracking-wider text-base-content/40"
                    >
                        <th class="font-medium">Period</th>
                        <th class="font-medium">Unlock Date</th>
                        <th class="font-medium text-right">Amount</th>
                        <th class="font-medium text-center">Status</th>
                        <th class="font-medium text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {#each displayPeriods as period (period.index)}
                        <tr
                            class="border-t border-base-content/5 hover:bg-base-200/10 transition-colors"
                        >
                            <td class="font-mono text-xs text-base-content/60">
                                #{period.index}
                            </td>
                            <td class="text-xs text-base-content/70">
                                {period.formattedDate}
                            </td>
                            <td class="text-right font-mono text-xs">
                                {period.formattedAmount}
                                <span class="text-base-content/30 ml-1"
                                    >ZARF</span
                                >
                            </td>
                            <td class="text-center">
                                {#if period.status === "claimed"}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success"
                                    >
                                        <Check class="w-3 h-3" />
                                        Claimed
                                    </span>
                                {:else if period.status === "claimable"}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary animate-pulse"
                                    >
                                        <Clock class="w-3 h-3" />
                                        Ready
                                    </span>
                                {:else}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-base-content/5 text-base-content/40"
                                    >
                                        <Lock class="w-3 h-3" />
                                        Locked
                                    </span>
                                {/if}
                            </td>
                            <td class="text-right">
                                {#if period.status === "claimable"}
                                    <button
                                        class="btn btn-xs btn-primary btn-outline"
                                        onclick={() => {
                                            // period.index is 1-based, array is 0-based
                                            // Assume epochs are sorted same as schedule: 0..N
                                            // But wait, epochs might not match schedule periods 1:1 if implementation differs
                                            // Assuming periods[i] maps to epochs[i]
                                            claimStore.state.selectedEpochIndex =
                                                period.index - 1;
                                            claimStore.nextStep();
                                        }}
                                    >
                                        Claim
                                    </button>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>

            <!-- Expand/Collapse Button -->
            {#if hasMore}
                <button
                    class="w-full py-2 text-xs text-base-content/40 hover:text-base-content/60 hover:bg-base-200/10 transition-colors flex items-center justify-center gap-1 border-t border-base-content/5"
                    onclick={() => (isExpanded = !isExpanded)}
                >
                    {#if isExpanded}
                        <ChevronUp class="w-3.5 h-3.5" />
                        Show less
                    {:else}
                        <ChevronDown class="w-3.5 h-3.5" />
                        Show all {periods.length} periods
                    {/if}
                </button>
            {/if}
        </div>
    </div>
{/if}
