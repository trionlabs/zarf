<script lang="ts">
    import { claimStore } from "../../stores/claimStore.svelte";
    import { Clock } from "lucide-svelte";

    // Derived values for display
    let percent = $derived.by(() => {
        const total = Number(claimStore.totalAllocation);
        const vested = Number(claimStore.vestedAmount);
        return total > 0 ? (vested / total) * 100 : 0;
    });

    // Formatting dates
    const formatDate = (ts: number) =>
        new Date(ts * 1000).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });

    let start = $derived(
        claimStore.vestingSchedule
            ? formatDate(claimStore.vestingSchedule.vestingStart)
            : "Start",
    );
    let cliffEnd = $derived(
        claimStore.vestingSchedule
            ? formatDate(
                  claimStore.vestingSchedule.vestingStart +
                      claimStore.vestingSchedule.cliffDuration,
              )
            : "Cliff",
    );
    let end = $derived(
        claimStore.vestingSchedule
            ? formatDate(
                  claimStore.vestingSchedule.vestingStart +
                      claimStore.vestingSchedule.cliffDuration +
                      claimStore.vestingSchedule.vestingDuration,
              )
            : "End",
    );

    // Calculation for marker positions
    let totalDuration = $derived(
        claimStore.vestingSchedule
            ? claimStore.vestingSchedule.cliffDuration +
                  claimStore.vestingSchedule.vestingDuration
            : 100,
    );
    let cliffPercent = $derived(
        claimStore.vestingSchedule
            ? (claimStore.vestingSchedule.cliffDuration / totalDuration) * 100
            : 0,
    );

    // Timeline progress based on time
    let timelineProgress = $derived.by(() => {
        if (!claimStore.vestingSchedule) return 0;
        const now = Date.now() / 1000;
        const startTs = claimStore.vestingSchedule.vestingStart;
        const total =
            claimStore.vestingSchedule.cliffDuration +
            claimStore.vestingSchedule.vestingDuration;
        const passed = now - startTs;
        const p = (passed / total) * 100;
        return Math.min(100, Math.max(0, p));
    });

    // Calculate next unlock date
    let nextUnlock = $derived.by(() => {
        if (!claimStore.epochs || claimStore.epochs.length === 0) {
            // Fallback: If no epochs loaded but schedule exists, and we are before cliff
            if (claimStore.vestingSchedule) {
                const start = Number(claimStore.vestingSchedule.vestingStart);
                const cliff = Number(claimStore.vestingSchedule.cliffDuration);
                const cliffEndTs = start + cliff;
                if (Date.now() / 1000 < cliffEndTs) {
                    return new Date(cliffEndTs * 1000);
                }
            }
            return null;
        }

        // Find the earliest locked epoch
        const locked = claimStore.epochs
            .filter((e) => e.isLocked)
            .sort((a, b) => a.unlockTime - b.unlockTime);

        if (locked.length > 0) {
            return new Date(locked[0].unlockTime * 1000);
        }
        return null;
    });
</script>

<!-- Zen Pro Timeline: Clean, minimal, refined -->
<div class="space-y-4 w-full">
    <!-- Header Labels -->
    <div
        class="flex justify-between text-[10px] uppercase tracking-wider text-zen-fg-faint font-medium"
    >
        <span>Start</span>
        {#if cliffPercent > 15 && cliffPercent < 85}
            <span
                class="absolute"
                style="left: {cliffPercent}%; transform: translateX(-50%);"
                >Cliff End ({cliffPercent.toFixed(0)}%)</span
            >
        {/if}
        <span>End</span>
    </div>

    <!-- Timeline Container -->
    <div
        class="relative h-3 bg-zen-fg/10 rounded-full w-full overflow-hidden"
    >
        <!-- Cliff Marker Line -->
        {#if cliffPercent > 0}
            <div
                class="absolute h-full w-px bg-zen-fg/10"
                style="left: {cliffPercent}%"
            ></div>
        {/if}

        <!-- Time Passed Bar (subtle) -->
        <div
            class="absolute h-full bg-zen-fg/5 rounded-full transition-all duration-1000 ease-out"
            style="width: {timelineProgress}%"
        ></div>

        <!-- Vested Bar (primary gradient) -->
        <div
            class="absolute h-full bg-gradient-to-r from-zen-primary/60 to-zen-primary rounded-full transition-all duration-1000 ease-out"
            style="left: {cliffPercent}%; width: {(percent *
                (100 - cliffPercent)) /
                100}%"
        ></div>

        <!-- Current Position Indicator -->
        <div
            class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-zen-bg rounded-full shadow-sm border border-zen-primary/50 z-20 transition-all duration-1000"
            style="left: calc({timelineProgress}% - 6px)"
        ></div>
    </div>

    <!-- Date Labels -->
    <div
        class="relative flex justify-between text-xs font-light text-zen-fg-muted"
    >
        <span>{start}</span>
        {#if cliffPercent > 15 && cliffPercent < 85}
            <span
                class="absolute"
                style="left: {cliffPercent}%; transform: translateX(-50%);"
                >{cliffEnd}</span
            >
        {/if}
        <span>{end}</span>
    </div>

    <!-- Next Unlock Info: Zen Pro Style -->
    {#if nextUnlock}
        <div
            class="mt-2 p-3 bg-zen-fg/5 rounded-lg text-xs flex items-center justify-center gap-2 border border-zen-border-subtle"
        >
            <Clock class="w-3.5 h-3.5 text-zen-fg-subtle" />
            <span class="text-zen-fg-subtle">Next unlock:</span>
            <span class="font-medium text-zen-fg-muted"
                >{nextUnlock.toLocaleDateString()} ({Math.ceil(
                    (nextUnlock.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                )} days)</span
            >
        </div>
    {/if}
</div>
