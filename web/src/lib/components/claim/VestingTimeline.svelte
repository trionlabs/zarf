<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { Clock } from "lucide-svelte";

    // Derived values for display
    let percent = $derived(claimStore.percentVested);

    // Formatting dates
    const formatDate = (ts: number) =>
        new Date(ts * 1000).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });

    let start = $derived(
        claimStore.vestingInfo
            ? formatDate(claimStore.vestingInfo.vestingStart)
            : "Start",
    );
    let cliffEnd = $derived(
        claimStore.vestingInfo
            ? formatDate(
                  claimStore.vestingInfo.vestingStart +
                      claimStore.vestingInfo.cliffDuration,
              )
            : "Cliff",
    );
    let end = $derived(
        claimStore.vestingInfo
            ? formatDate(
                  claimStore.vestingInfo.vestingStart +
                      claimStore.vestingInfo.cliffDuration +
                      claimStore.vestingInfo.vestingDuration,
              )
            : "End",
    );

    let nextUnlock = $derived(claimStore.nextUnlockDate);

    // Calculation for marker positions
    let totalDuration = $derived(
        claimStore.vestingInfo
            ? claimStore.vestingInfo.cliffDuration +
                  claimStore.vestingInfo.vestingDuration
            : 100,
    );
    let cliffPercent = $derived(
        claimStore.vestingInfo
            ? (claimStore.vestingInfo.cliffDuration / totalDuration) * 100
            : 0,
    );

    // Timeline progress based on time
    let timelineProgress = $derived.by(() => {
        if (!claimStore.vestingInfo) return 0;
        const now = Date.now() / 1000;
        const startTs = claimStore.vestingInfo.vestingStart;
        const total =
            claimStore.vestingInfo.cliffDuration +
            claimStore.vestingInfo.vestingDuration;
        const passed = now - startTs;
        const p = (passed / total) * 100;
        return Math.min(100, Math.max(0, p));
    });
</script>

<!-- Zen Pro Timeline: Clean, minimal, refined -->
<div class="space-y-4 w-full">
    <!-- Header Labels -->
    <div
        class="flex justify-between text-[10px] uppercase tracking-wider text-base-content/30 font-medium"
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
        class="relative h-3 bg-base-200/30 rounded-full w-full overflow-hidden"
    >
        <!-- Cliff Marker Line -->
        {#if cliffPercent > 0}
            <div
                class="absolute h-full w-px bg-base-content/10"
                style="left: {cliffPercent}%"
            ></div>
        {/if}

        <!-- Time Passed Bar (subtle) -->
        <div
            class="absolute h-full bg-base-content/5 rounded-full transition-all duration-1000 ease-out"
            style="width: {timelineProgress}%"
        ></div>

        <!-- Vested Bar (primary gradient) -->
        <div
            class="absolute h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-1000 ease-out"
            style="left: {cliffPercent}%; width: {(percent *
                (100 - cliffPercent)) /
                100}%"
        ></div>

        <!-- Current Position Indicator -->
        <div
            class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-base-100 rounded-full shadow-sm border border-primary/50 z-20 transition-all duration-1000"
            style="left: calc({timelineProgress}% - 6px)"
        ></div>
    </div>

    <!-- Date Labels -->
    <div
        class="relative flex justify-between text-xs font-light text-base-content/50"
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
            class="mt-2 p-3 bg-base-200/20 rounded-lg text-xs flex items-center justify-center gap-2 border border-base-content/5"
        >
            <Clock class="w-3.5 h-3.5 text-base-content/40" />
            <span class="text-base-content/40">Next unlock:</span>
            <span class="font-medium text-base-content/70"
                >{nextUnlock.toLocaleDateString()} ({Math.ceil(
                    (nextUnlock.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                )} days)</span
            >
        </div>
    {/if}
</div>
