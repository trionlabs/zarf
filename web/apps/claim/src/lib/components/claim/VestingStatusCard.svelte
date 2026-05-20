<script lang="ts">
    import { claimStore } from "../../stores/claimStore.svelte";
    import { formatTokenAmount } from "@zarf/core/utils/amount";
    import VestingTimeline from "./VestingTimeline.svelte";
    import VestingScheduleTable from "./VestingScheduleTable.svelte";
    import CliffCountdown from "./CliffCountdown.svelte";
    import { CalendarClock, Coins, Lock, CheckCircle } from "lucide-svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    let { contractAddress } = $props<{ contractAddress: string }>();

    // Computed formatters
    const format = (val: bigint) =>
        formatTokenAmount(val, claimStore.tokenDecimals, 0);

    let total = $derived(claimStore.totalAllocation);
    let claimed = $derived(claimStore.claimedAmount);
    let vested = $derived(claimStore.vestedAmount);
    let claimable = $derived(claimStore.claimableAmount);

    // Status Logic
    let isCliffActive = $derived(claimStore.isCliffPassed === false);
    let isFullyClaimed = $derived(claimed >= total && total > 0n);
    let hasClaimable = $derived(claimable > 0n);
    let hasUnlocked = $derived(vested > 0n);
    let isWaitingForFirstUnlock = $derived(
        total > 0n && !hasUnlocked && !isCliffActive && !isFullyClaimed,
    );
    let isWaitingForNextUnlock = $derived(
        total > 0n && hasUnlocked && !hasClaimable && !isFullyClaimed,
    );
    let vestedPercent = $derived(
        Number(total) > 0
            ? ((Number(vested) / Number(total)) * 100).toFixed(0)
            : "0",
    );
</script>

<!-- Zen Pro Layout: Open, minimal, no card wrapper -->
<div class="max-w-2xl animate-in fade-in zoom-in duration-300">
    <div class="space-y-8">
        <!-- Header Section: Wizard Style -->
        <header class="space-y-4">
            <div class="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2
                        class="text-2xl font-light tracking-tight text-zen-fg"
                    >
                        {#if isFullyClaimed}
                            Allocation Complete
                        {:else if isCliffActive}
                            Vesting Locked
                        {:else if isWaitingForFirstUnlock}
                            Eligible, Unlock Pending
                        {:else if isWaitingForNextUnlock}
                            Next Unlock Pending
                        {:else}
                            Vesting Dashboard
                        {/if}
                    </h2>
                    <p class="text-base text-zen-fg-muted font-light mt-1">
                        {#if isFullyClaimed}
                            You have claimed 100% of your tokens.
                        {:else if isWaitingForFirstUnlock}
                            Your allocation was found. The first unlocked period has not arrived yet.
                        {:else if isWaitingForNextUnlock}
                            Nothing new is claimable right now. Your remaining periods are still locked.
                        {:else}
                            Track your unlocking schedule.
                        {/if}
                    </p>
                </div>

                <!-- Total Allocation Badge -->
                <div class="text-right">
                    <div
                        class="text-[10px] uppercase tracking-wider text-zen-fg-subtle font-medium"
                    >
                        Total Allocation
                    </div>
                    <div
                        class="text-xl font-mono font-semibold text-zen-fg mt-0.5"
                    >
                        {format(total)}
                        <span
                            class="text-sm text-zen-fg-subtle font-sans font-normal"
                            >{claimStore.tokenSymbol}</span
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
                    class="p-4 rounded-xl bg-zen-fg/5 border-[0.5px] border-zen-border-subtle space-y-2"
                >
                    <span
                        class="text-[10px] uppercase tracking-wider text-zen-fg-subtle font-medium"
                        >Already Claimed</span
                    >
                    <div
                        class="text-xl font-mono font-semibold text-zen-fg-muted"
                    >
                        {format(claimed)}
                    </div>
                </div>

                <!-- Vested (Locked + Claimable) -->
                <div
                    class="p-4 rounded-xl bg-zen-fg/5 border-[0.5px] border-zen-border-subtle space-y-2"
                >
                    <span
                        class="text-[10px] uppercase tracking-wider text-zen-fg-subtle font-medium"
                        >Total Vested</span
                    >
                    <div class="text-xl font-mono font-semibold text-zen-info">
                        {format(vested)}
                    </div>
                    <div class="text-[10px] text-zen-fg-faint font-mono">
                        {vestedPercent}% completed
                    </div>
                </div>

                <!-- Claimable Now (Hero) -->
                <div
                    class="p-4 rounded-xl {hasClaimable ? 'bg-zen-primary/5 border-zen-primary/10' : 'bg-zen-fg/5 border-zen-border-subtle'} border-[0.5px] space-y-2 relative overflow-hidden group"
                >
                    <div
                        class="absolute inset-0 bg-gradient-to-br from-zen-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                    ></div>
                    <span
                        class="text-[10px] uppercase tracking-wider text-zen-primary/80 font-medium relative z-10"
                        >Claimable Now</span
                    >
                    <div
                        class="text-2xl font-mono font-bold text-zen-primary relative z-10 tracking-tight"
                    >
                        {format(claimable)}
                    </div>
                    <div
                        class="text-[10px] {hasClaimable ? 'text-zen-primary/50' : 'text-zen-fg-subtle'} font-light relative z-10"
                    >
                        {hasClaimable ? "Ready to withdraw" : "Awaiting unlock"}
                    </div>
                    <Coins
                        class="absolute -bottom-3 -right-3 w-12 h-12 text-zen-primary/5 -rotate-12"
                    />
                </div>
            </div>
        {/if}

        {#if isWaitingForFirstUnlock || isWaitingForNextUnlock}
            <div
                class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-zen-info/5 border-[0.5px] border-zen-info/15"
            >
                <div
                    class="w-10 h-10 rounded-full bg-zen-info/10 text-zen-info flex items-center justify-center shrink-0"
                >
                    <CalendarClock class="w-5 h-5" />
                </div>
                <div class="space-y-1">
                    <p class="text-sm font-medium text-zen-fg">
                        {isWaitingForFirstUnlock ? "You are eligible, but nothing is unlocked yet." : "You are caught up for now."}
                    </p>
                    <p class="text-xs text-zen-fg-muted leading-relaxed">
                        {isWaitingForFirstUnlock
                            ? "Keep this distribution in your vault. The claim action will appear automatically when the first period unlocks."
                            : "Return when the next period unlocks, or use the schedule below to see what is already claimed and what is still locked."}
                    </p>
                </div>
            </div>
        {/if}

        <!-- Timeline Visual -->
        <div class="pt-2">
            <VestingTimeline />
        </div>

        <!-- Detailed Unlock Schedule -->
        <VestingScheduleTable {contractAddress} />

        <!-- Actions: Zen Pro Button Style -->
        <footer class="pt-4 border-t-[0.5px] border-zen-border-subtle">
            {#if isFullyClaimed}
                <ZenButton
                    variant="ghost"
                    class="w-full bg-zen-fg/5 border-zen-border-subtle text-zen-fg-subtle cursor-not-allowed"
                    disabled
                >
                    <CheckCircle class="w-4 h-4 mr-2" />
                    All Tokens Claimed
                </ZenButton>
            {:else if hasClaimable}
                <div class="text-center space-y-2">
                    <p class="text-xs text-zen-fg-muted">
                        Select an unlocked period from the schedule above to
                        start your claim.
                    </p>
                </div>
            {:else}
                <ZenButton
                    variant="ghost"
                    class="w-full border-[0.5px] border-dashed border-zen-border text-zen-fg-subtle hover:bg-zen-fg/5 cursor-not-allowed"
                    disabled
                >
                    {#if isWaitingForFirstUnlock || isWaitingForNextUnlock}
                        <CalendarClock class="w-4 h-4 mr-2" />
                        {isWaitingForFirstUnlock ? "Waiting for First Unlock" : "Next Unlock Pending"}
                    {:else}
                        <Lock class="w-4 h-4 mr-2" />
                        No Tokens Available Yet
                    {/if}
                </ZenButton>
            {/if}
        </footer>
    </div>
</div>
