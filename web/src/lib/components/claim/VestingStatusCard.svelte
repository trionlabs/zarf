<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { formatUnits } from "viem";
    import VestingTimeline from "./VestingTimeline.svelte";
    import VestingScheduleTable from "./VestingScheduleTable.svelte";
    import CliffCountdown from "./CliffCountdown.svelte";
    import { ArrowRight, Coins, Lock, CheckCircle } from "lucide-svelte";

    // Computed formatters
    const format = (val: bigint) =>
        Number(formatUnits(val, 18)).toLocaleString(undefined, {
            maximumFractionDigits: 0,
        });

    let total = $derived(claimStore.totalAllocation);
    let claimed = $derived(claimStore.claimedAmount);
    let vested = $derived(claimStore.vestedAmount);
    let claimable = $derived(claimStore.claimableAmount);

    // Status Logic
    let isCliffActive = $derived(!claimStore.isCliffPassed);
    let isFullyClaimed = $derived(claimed >= total && total > 0n);
    let hasClaimable = $derived(claimable > 0n);
    let vestedPercent = $derived(
        Number(total) > 0
            ? ((Number(vested) / Number(total)) * 100).toFixed(0)
            : "0",
    );

    function handleContinue() {
        claimStore.nextStep();
    }
</script>

<!-- Zen Pro Layout: Open, minimal, no card wrapper -->
<div class="max-w-2xl animate-in fade-in zoom-in duration-300">
    <div class="space-y-8">
        <!-- Header Section: Wizard Style -->
        <header class="space-y-4">
            <div class="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2
                        class="text-2xl font-light tracking-tight text-base-content"
                    >
                        {#if isFullyClaimed}
                            Allocation Complete
                        {:else if isCliffActive}
                            Vesting Locked
                        {:else}
                            Vesting Dashboard
                        {/if}
                    </h2>
                    <p class="text-base text-base-content/50 font-light mt-1">
                        {#if isFullyClaimed}
                            You have claimed 100% of your tokens.
                        {:else}
                            Track your unlocking schedule.
                        {/if}
                    </p>
                </div>

                <!-- Total Allocation Badge -->
                <div class="text-right">
                    <div
                        class="text-[10px] uppercase tracking-wider text-base-content/40 font-medium"
                    >
                        Total Allocation
                    </div>
                    <div
                        class="text-xl font-mono font-semibold text-base-content mt-0.5"
                    >
                        {format(total)}
                        <span
                            class="text-sm text-base-content/40 font-sans font-normal"
                            >ZARF</span
                        >
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content Area -->
        {#if isCliffActive}
            <CliffCountdown />
        {:else}
            <!-- Token Stats Grid: Zen Pro Style -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <!-- Claimed -->
                <div
                    class="p-4 rounded-xl bg-base-200/20 border border-base-content/5 space-y-2"
                >
                    <span
                        class="text-[10px] uppercase tracking-wider text-base-content/40 font-medium"
                        >Already Claimed</span
                    >
                    <div
                        class="text-xl font-mono font-semibold text-base-content/60"
                    >
                        {format(claimed)}
                    </div>
                </div>

                <!-- Vested (Locked + Claimable) -->
                <div
                    class="p-4 rounded-xl bg-base-200/20 border border-base-content/5 space-y-2"
                >
                    <span
                        class="text-[10px] uppercase tracking-wider text-base-content/40 font-medium"
                        >Total Vested</span
                    >
                    <div class="text-xl font-mono font-semibold text-secondary">
                        {format(vested)}
                    </div>
                    <div class="text-[10px] text-base-content/30 font-mono">
                        {vestedPercent}% completed
                    </div>
                </div>

                <!-- Claimable Now (Hero) -->
                <div
                    class="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-2 relative overflow-hidden group"
                >
                    <div
                        class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                    ></div>
                    <span
                        class="text-[10px] uppercase tracking-wider text-primary/80 font-medium relative z-10"
                        >Claimable Now</span
                    >
                    <div
                        class="text-2xl font-mono font-bold text-primary relative z-10 tracking-tight"
                    >
                        {format(claimable)}
                    </div>
                    <div
                        class="text-[10px] text-primary/50 font-light relative z-10"
                    >
                        Ready to withdraw
                    </div>
                    <Coins
                        class="absolute -bottom-3 -right-3 w-12 h-12 text-primary/5 -rotate-12"
                    />
                </div>
            </div>
        {/if}

        <!-- Timeline Visual -->
        <div class="pt-2">
            <VestingTimeline />
        </div>

        <!-- Detailed Unlock Schedule -->
        <VestingScheduleTable />

        <!-- Actions: Zen Pro Button Style -->
        <footer class="pt-4 border-t border-base-content/5">
            {#if isFullyClaimed}
                <button
                    class="btn btn-neutral w-full bg-base-200/50 border-base-content/5 text-base-content/40 hover:bg-base-200"
                    disabled
                >
                    <CheckCircle class="w-4 h-4 mr-2" />
                    All Tokens Claimed
                </button>
            {:else if hasClaimable}
                <button
                    class="btn btn-primary w-full rounded-lg shadow-md shadow-primary/10 hover:shadow-primary/20 transition-all transform active:scale-[0.98] group"
                    onclick={handleContinue}
                >
                    Continue to Claim
                    <ArrowRight
                        class="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform"
                    />
                </button>
            {:else}
                <button
                    class="btn btn-ghost w-full border border-dashed border-base-content/10 text-base-content/40 hover:bg-base-200/30 hover:border-base-content/20"
                    disabled
                >
                    <Lock class="w-4 h-4 mr-2" />
                    No Tokens Available Yet
                </button>
            {/if}
        </footer>
    </div>
</div>
