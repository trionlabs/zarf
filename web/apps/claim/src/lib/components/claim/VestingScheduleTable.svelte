<script lang="ts">
    import { claimStore } from "../../stores/claimStore.svelte";
    import { formatUnits } from "viem";
    import type { VestingPeriod } from "@zarf/core/utils";
    import {
        Check,
        Clock,
        Lock,
        ChevronDown,
        ChevronUp,
        X,
    } from "lucide-svelte";
    import { slide, fade } from "svelte/transition";
    import ClaimStep3Wallet from "./steps/ClaimStep3Wallet.svelte";
    import ClaimStep4Proof from "./steps/ClaimStep4Proof.svelte";
    import ClaimStep5Submit from "./steps/ClaimStep5Submit.svelte";

    let { contractAddress } = $props<{ contractAddress: string }>();

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

    let periods = $derived(claimStore.periods);

    let isExpanded = $state(false);
    let displayPeriods = $derived.by(() => {
        const source =
            isExpanded || periods.length <= 11 ? periods : periods.slice(0, 10);
        return source.map((p: VestingPeriod) => ({
            ...p,
            formattedDate: formatDate(p.unlockDate.getTime() / 1000),
            formattedAmount: format(p.amount),
        }));
    });

    let hasMore = $derived(periods.length > 4);
    let claimedCount = $derived(
        periods.filter((p: VestingPeriod) => p.status === "claimed").length,
    );
    let claimableCount = $derived(
        periods.filter((p: VestingPeriod) => p.status === "claimable").length,
    );
    let lockedCount = $derived(
        periods.filter((p: VestingPeriod) => p.status === "locked").length,
    );

    // Active Claim Row
    let activeEpochIndex = $derived(claimStore.state.selectedEpochIndex);
    let currentStep = $derived(claimStore.currentStep);

    function handleStartClaim(index: number) {
        // If already active, toggle off?
        if (activeEpochIndex === index - 1 && currentStep >= 3) {
            claimStore.state.currentStep = 2;
            claimStore.state.selectedEpochIndex = null;
            return;
        }

        claimStore.state.selectedEpochIndex = index - 1;
        claimStore.state.currentStep = 3; // Move to Wallet Step
    }

    function handleCancel() {
        claimStore.state.currentStep = 2;
        claimStore.state.selectedEpochIndex = null;
    }
</script>

{#if periods.length > 0}
    <div class="space-y-4">
        <!-- Section Header -->
        <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-zen-fg-muted">
                Unlock Schedule
            </h3>
            <div class="flex items-center gap-3 text-xs">
                {#if claimedCount > 0}
                    <span class="flex items-center gap-1 text-zen-success">
                        <Check class="w-3 h-3" />
                        {claimedCount} claimed
                    </span>
                {/if}
                {#if claimableCount > 0}
                    <span class="flex items-center gap-1 text-zen-primary">
                        <Clock class="w-3 h-3" />
                        {claimableCount} ready
                    </span>
                {/if}
                {#if lockedCount > 0}
                    <span class="flex items-center gap-1 text-zen-fg-subtle">
                        <Lock class="w-3 h-3" />
                        {lockedCount} locked
                    </span>
                {/if}
            </div>
        </div>

        <!-- Table -->
        <div
            class="overflow-hidden rounded-xl border-[0.5px] border-zen-border-subtle bg-zen-bg shadow-sm"
        >
            <table
                class="w-full border-separate border-spacing-0"
            >
                <thead>
                    <tr
                        class="bg-zen-fg/5 text-xs uppercase tracking-wider text-zen-fg-subtle"
                    >
                        <th scope="col" class="font-medium p-4 text-left">Period</th>
                        <th scope="col" class="font-medium p-4 text-left">Unlock Date</th>
                        <th scope="col" class="font-medium p-4 text-right">Amount</th>
                        <th scope="col" class="font-medium p-4 text-center">Status</th>
                        <th scope="col" class="font-medium p-4 text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {#each displayPeriods as period (period.index)}
                        {@const isActive =
                            activeEpochIndex === period.index - 1}

                        <tr
                            class="group transition-colors {isActive
                                ? 'bg-zen-primary/[0.02]'
                                : 'hover:bg-zen-fg/5'}"
                        >
                            <td
                                class="p-4 font-mono text-xs text-zen-fg-muted border-t-[0.5px] border-zen-border-subtle"
                            >
                                #{period.index}
                            </td>
                            <td
                                class="p-4 text-xs text-zen-fg-muted border-t-[0.5px] border-zen-border-subtle"
                            >
                                {period.formattedDate}
                            </td>
                            <td
                                class="p-4 text-right font-mono text-xs border-t-[0.5px] border-zen-border-subtle"
                            >
                                {period.formattedAmount}
                                <span class="text-zen-fg-faint ml-1"
                                    >ZARF</span
                                >
                            </td>
                            <td
                                class="p-4 text-center border-t-[0.5px] border-zen-border-subtle"
                            >
                                {#if period.status === "claimed"}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zen-success/10 text-zen-success"
                                    >
                                        <Check class="w-3 h-3" />
                                        Claimed
                                    </span>
                                {:else if period.status === "claimable"}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zen-primary/10 text-zen-primary"
                                    >
                                        <Clock class="w-3 h-3" />
                                        Ready
                                    </span>
                                {:else}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zen-fg/5 text-zen-fg-subtle"
                                    >
                                        <Lock class="w-3 h-3" />
                                        Locked
                                    </span>
                                {/if}
                            </td>
                            <td
                                class="p-4 text-right border-t-[0.5px] border-zen-border-subtle"
                            >
                                {#if period.status === "claimable"}
                                    <button
                                        class="px-4 py-1 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors {isActive
                                            ? 'text-zen-primary bg-transparent'
                                            : 'border border-zen-primary text-zen-primary hover:bg-zen-primary hover:text-zen-primary-content'}"
                                        onclick={() =>
                                            handleStartClaim(period.index)}
                                    >
                                        {isActive ? "Active" : "Claim"}
                                    </button>
                                {/if}
                            </td>
                        </tr>

                        <!-- Drawer Row -->
                        {#if isActive && currentStep >= 3}
                            <tr class="bg-zen-bg relative overflow-hidden">
                                <td
                                    colspan="5"
                                    class="p-0 border-t-[0.5px] border-zen-primary/10"
                                >
                                    <div
                                        in:slide={{ duration: 400 }}
                                        class="relative bg-gradient-to-b from-zen-primary/[0.02] to-transparent"
                                    >
                                        <!-- Header / Step Indicator -->
                                        <div
                                            class="flex items-center justify-between px-6 py-3 border-b-[0.5px] border-zen-border-subtle"
                                        >
                                            <div class="flex gap-1.5">
                                                {#each [3, 4, 5] as step}
                                                    <div
                                                        class="h-1 w-6 rounded-full transition-all duration-500 {currentStep >=
                                                        step
                                                            ? 'bg-zen-primary'
                                                            : 'bg-zen-fg/10'}"
                                                    ></div>
                                                {/each}
                                            </div>
                                            <button
                                                class="text-zen-fg-faint hover:text-zen-fg-muted transition-colors"
                                                onclick={handleCancel}
                                            >
                                                <X class="w-4 h-4" />
                                            </button>
                                        </div>

                                        <!-- Content Wrapper -->
                                        <div class="p-6">
                                            {#if currentStep === 3}
                                                <div
                                                    in:fade={{
                                                        duration: 300,
                                                        delay: 100,
                                                    }}
                                                >
                                                    <ClaimStep3Wallet />
                                                </div>
                                            {:else if currentStep === 4}
                                                <div
                                                    in:fade={{ duration: 300 }}
                                                >
                                                    <ClaimStep4Proof
                                                        {contractAddress}
                                                    />
                                                </div>
                                            {:else if currentStep === 5}
                                                <div
                                                    in:fade={{ duration: 300 }}
                                                >
                                                    <ClaimStep5Submit
                                                        {contractAddress}
                                                    />
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>

            <!-- Expand/Collapse Button -->
            {#if hasMore}
                <button
                    class="w-full py-4 text-xs uppercase tracking-widest font-bold text-zen-fg-faint hover:text-zen-fg-muted hover:bg-zen-fg/5 transition-colors flex items-center justify-center gap-2 border-t-[0.5px] border-zen-border-subtle"
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
