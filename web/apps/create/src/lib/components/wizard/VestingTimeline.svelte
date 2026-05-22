<script lang="ts">
    /**
     * VestingTimeline - Ultra-Premium Visualization
     *
     * Features:
     * - Token amounts per unlock (not just percentages)
     * - Hover tooltips with exact dates and amounts
     * - Smart bar grouping for many unlock events
     * - Instant unlock (0 duration) support
     * - Lock period with token count
     * - Unit-aware calculations (Weeks/Months/Quarters/Years)
     * - Calendar-aligned unlock dates (e.g. 5th of every month)
     */

    import { Lock } from "lucide-svelte";
    import {
        calculateEndDate,
        calculateUnlockEvents,
        generateUnlockMarkers,
        type DurationUnit,
    } from "@zarf/core/utils/vesting";

    interface Props {
        cliffEndDate?: string;
        cliffTime?: string;
        duration?: number;
        durationUnit?: DurationUnit;
        totalTokens?: number;
        tokenSymbol?: string;
    }

    let {
        cliffEndDate = "",
        cliffTime = "12:00",
        duration = 12,
        durationUnit = "months",
        totalTokens = 0,
        tokenSymbol = "TOKENS",
    }: Props = $props();

    // Core date calculations
    const today = new Date();

    const cliffDate = $derived(
        cliffEndDate ? new Date(cliffEndDate + "T" + cliffTime + ":00Z") : null,
    );

    // END DATE
    const endDate = $derived(
        calculateEndDate(cliffDate, duration, durationUnit),
    );

    // Days calculations (for display/graph proportions)
    const daysToCliff = $derived(
        cliffDate
            ? Math.ceil(
                  (cliffDate.getTime() - today.getTime()) /
                      (24 * 60 * 60 * 1000),
              )
            : 0,
    );

    const totalDaysFromNow = $derived(
        endDate
            ? Math.ceil(
                  (endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
              )
            : 0,
    );

    // Is this an instant unlock?
    const isInstant = $derived(duration === 0);

    // UNLOCK EVENTS
    const unlockEvents = $derived(
        calculateUnlockEvents(cliffDate, endDate, duration),
    );

    // Token amounts
    const tokensPerUnlock = $derived(
        unlockEvents > 0 && totalTokens > 0
            ? Math.floor(totalTokens / unlockEvents)
            : 0,
    );

    // Format helpers
    const formatNumber = (n: number) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
        return n.toLocaleString();
    };

    const formatDateLong = (date: Date | null) => {
        if (!date) return "—";
        const dateStr = date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
        });

        if (durationUnit === "hours" || durationUnit === "minutes") {
            return `${dateStr} @ ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
        }
        return dateStr;
    };

    const formatDateShort = (date: Date | null) => {
        if (!date) return "—";

        if (durationUnit === "hours" || durationUnit === "minutes") {
            return date.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        }

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const formatTime = (time: string) => {
        return time + " UTC";
    };

    // Chart calculations
    const hasValidDates = $derived(
        cliffDate !== null && !isNaN(cliffDate.getTime()),
    );

    // Smart lock period sizing (min 10%, max 35%)
    const lockPeriodPercent = $derived.by(() => {
        if (!hasValidDates || totalDaysFromNow <= 0) return 0;
        if (isInstant) return 100;
        const natural = (daysToCliff / totalDaysFromNow) * 100;
        return Math.min(Math.max(natural, 10), 35);
    });

    // GENERATE MARKERS
    const unlockMarkers = $derived(
        generateUnlockMarkers(
            cliffDate,
            endDate,
            unlockEvents,
            durationUnit,
            totalTokens,
            lockPeriodPercent,
        ),
    );

    // Frequency label
    const frequencyLabel = $derived.by(() => {
        switch (durationUnit) {
            case "minutes":
                return "Every Minute";
            case "hours":
                return "Hourly";
            case "weeks":
                return "Weekly";
            case "months":
                return "Monthly";
            case "quarters":
                return "Quarterly";
            default:
                return "Yearly";
        }
    });

    // Clean Markup: Extract template logic to $derived
    const showLockPeriodBar = $derived(!isInstant && daysToCliff > 0);

    // Interactive State (Singleton Tooltip)
    let activeTooltipIndex = $state<number | null>(null);
    let isHoveringLock = $state(false);
</script>

{#if hasValidDates}
    <div class="space-y-10">
        <!-- Header Metrics -->
        <div class="space-y-6">
            <!-- Primary Stats Row -->
            <div class="grid grid-cols-2 gap-6">
                <div>
                    <p
                        class="text-[10px] text-zen-fg-muted uppercase tracking-widest mb-1"
                    >
                        Lock Period
                    </p>
                    <p class="text-2xl font-light tabular-nums">
                        {daysToCliff}<span
                            class="text-sm text-zen-fg-subtle ml-1">days</span
                        >
                    </p>
                    <p class="text-xs text-zen-fg-subtle mt-0.5">
                        until {formatDateShort(cliffDate)}
                    </p>
                </div>
                <div>
                    <p
                        class="text-[10px] text-zen-fg-muted uppercase tracking-widest mb-1"
                    >
                        Vesting Duration
                    </p>
                    {#if isInstant}
                        <p class="text-2xl font-light text-zen-warning">Instant</p>
                        <p class="text-xs text-zen-fg-subtle mt-0.5">
                            100% at cliff end
                        </p>
                    {:else}
                        <p class="text-2xl font-light tabular-nums">
                            {duration}<span
                                class="text-sm text-zen-fg-subtle ml-1"
                                >{durationUnit}</span
                            >
                        </p>
                        <p class="text-xs text-zen-fg-subtle mt-0.5">
                            {frequencyLabel} unlocks
                        </p>
                    {/if}
                </div>
            </div>

            <!-- Token Amounts (if provided) -->
            {#if totalTokens > 0}
                <div
                    class="flex items-center gap-8 py-3 px-4 bg-zen-fg/[0.02] rounded-lg"
                >
                    <div>
                        <p
                            class="text-[10px] text-zen-fg-muted uppercase tracking-widest"
                        >
                            Total
                        </p>
                        <p class="text-lg font-medium tabular-nums">
                            {formatNumber(totalTokens)}
                            <span class="text-xs text-zen-fg-subtle"
                                >{tokenSymbol}</span
                            >
                        </p>
                    </div>
                    <div class="text-zen-fg/20">→</div>
                    <div>
                        <p
                            class="text-[10px] text-zen-fg-muted uppercase tracking-widest"
                        >
                            Per Unlock
                        </p>
                        <p class="text-lg font-medium tabular-nums">
                            {formatNumber(tokensPerUnlock)}
                            <span class="text-xs text-zen-fg-subtle"
                                >{tokenSymbol}</span
                            >
                        </p>
                    </div>
                    <div class="ml-auto text-right">
                        <p
                            class="text-[10px] text-zen-fg-muted uppercase tracking-widest"
                        >
                            Events
                        </p>
                        <p class="text-lg font-medium tabular-nums">
                            {unlockEvents}<span
                                class="text-xs text-zen-fg-subtle ml-1"
                                >×</span
                            >
                        </p>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Bar Graph -->
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <h4
                    class="text-[10px] font-semibold uppercase tracking-widest text-zen-fg-muted"
                >
                    Unlock Schedule
                </h4>
                <div class="flex gap-4 text-[10px] text-zen-fg-subtle">
                    <span class="flex items-center gap-1.5">
                        <div
                            class="w-2 h-2 bg-zen-fg/10 rounded-sm"
                        ></div>
                        Locked
                    </span>
                    <span class="flex items-center gap-1.5">
                        <div class="w-2 h-2 bg-zen-primary rounded-sm"></div>
                        Vested
                    </span>
                </div>
            </div>

            <!-- Graph -->
            <div class="relative h-40 w-full flex items-end gap-px pt-4">
                <!-- Grid Lines -->
                <div
                    class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-30"
                >
                    {#each [0, 25, 50, 75, 100] as _}
                        <div class="w-full h-px bg-zen-fg/5"></div>
                    {/each}
                </div>

                <!-- Lock Period Bar -->
                {#if showLockPeriodBar}
                    <!-- svelte-ignore a11y_mouse_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="h-full bg-zen-fg/[0.03] rounded-md flex items-center justify-center relative cursor-default transition-colors hover:bg-zen-fg/[0.05]"
                        style="width: {lockPeriodPercent}%; min-width: 40px;"
                        onmouseenter={() => (isHoveringLock = true)}
                        onmouseleave={() => (isHoveringLock = false)}
                    >
                        <Lock class="w-4 h-4 text-zen-fg/20" />

                        <!-- Lock Tooltip -->
                        {#if isHoveringLock}
                            <div
                                class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[140px]"
                            >
                                <div
                                    class="bg-zen-bg/95 backdrop-blur-md text-zen-fg border border-zen-border-subtle px-4 py-3 rounded-xl text-xs shadow-xl"
                                >
                                    <div
                                        class="font-semibold text-center mb-1.5 uppercase tracking-wide border-b border-zen-border-subtle pb-1.5 text-zen-fg/70"
                                    >
                                        Lock Period
                                    </div>
                                    <div
                                        class="text-zen-fg font-bold text-center text-lg tracking-tight"
                                    >
                                        {daysToCliff} days
                                    </div>
                                    <div
                                        class="text-zen-fg-subtle text-[10px] mt-0.5 text-center font-medium"
                                    >
                                        Ends {formatDateShort(cliffDate)}
                                    </div>
                                </div>
                                <div
                                    class="w-3 h-3 bg-zen-bg border-r border-b border-zen-border-subtle absolute left-1/2 -translate-x-1/2 -bottom-1.5 rotate-45 shadow-sm"
                                ></div>
                            </div>
                        {/if}
                    </div>
                {/if}

                <!-- Vesting Bars -->
                {#each unlockMarkers as marker, i}
                    <div
                        class="h-full flex-1 flex flex-col justify-end relative cursor-default min-w-[4px]"
                    >
                        <!-- Colored Bar (Hover Target) -->
                        <!-- svelte-ignore a11y_mouse_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="w-full bg-zen-fg/60 transition-all duration-200 rounded-t-sm hover:bg-zen-fg relative"
                            style="height: {marker.percent}%"
                            onmouseenter={() => (activeTooltipIndex = i)}
                            onmouseleave={() => (activeTooltipIndex = null)}
                        >
                            {#if activeTooltipIndex === i}
                                <!-- Hover Tooltip (Brutalist) -->
                                <div
                                    class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[120px]"
                                >
                                    <div
                                        class="bg-zen-bg/95 backdrop-blur-md text-zen-fg border border-zen-border-subtle px-4 py-3 rounded-xl text-xs shadow-xl"
                                    >
                                        <div
                                            class="font-semibold text-center mb-1.5 uppercase tracking-wide border-b border-zen-border-subtle pb-1.5 text-zen-fg/70"
                                        >
                                            {#if isInstant}
                                                Instant
                                            {:else}
                                                {marker.isGrouped
                                                    ? `Events 1-${marker.event}`
                                                    : `Unlock #${marker.event}`}
                                            {/if}
                                        </div>
                                        <div class="space-y-0.5 text-center">
                                            <div
                                                class="text-zen-fg font-bold text-lg tracking-tight"
                                            >
                                                {marker.percent}%
                                            </div>
                                            {#if totalTokens > 0}
                                                <div
                                                    class="text-zen-fg/60 font-medium"
                                                >
                                                    {formatNumber(
                                                        marker.tokens,
                                                    )}
                                                    {tokenSymbol}
                                                </div>
                                            {/if}
                                            {#if marker.date}
                                                <div
                                                    class="text-zen-fg-subtle text-[10px] pt-1 font-medium"
                                                >
                                                    {formatDateLong(
                                                        marker.date,
                                                    )}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                    <!-- Arrow -->
                                    <div
                                        class="w-3 h-3 bg-zen-bg border-r border-b border-zen-border-subtle absolute left-1/2 -translate-x-1/2 -bottom-1.5 rotate-45 shadow-sm"
                                    ></div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- X-Axis -->
            <div
                class="flex justify-between text-[10px] text-zen-fg-muted pt-2 border-t border-zen-border-subtle"
            >
                <div>
                    <div class="font-medium">Today</div>
                    <div class="text-[9px] text-zen-fg/20">
                        {formatDateShort(today)}
                    </div>
                </div>
                {#if !isInstant}
                    <div class="text-center">
                        <div class="font-medium">Cliff Ends</div>
                        <div class="text-[9px] text-zen-fg/20">
                            {formatDateShort(cliffDate)}
                        </div>
                    </div>
                {/if}
                <div class="text-right">
                    <div class="font-medium">
                        {isInstant ? "100% Unlocked" : "Fully Vested"}
                    </div>
                    <div class="text-[9px] text-zen-fg/20">
                        {formatDateShort(endDate)}
                    </div>
                </div>
            </div>
        </div>
    </div>
{:else}
    <!-- Empty State -->
    <div
        class="h-48 flex flex-col items-center justify-center text-center opacity-30"
    >
        <div
            class="w-12 h-12 border border-current rounded-full flex items-center justify-center mb-3"
        >
            <span class="text-xl">?</span>
        </div>
        <p class="text-xs font-medium uppercase tracking-widest">
            Configure Schedule
        </p>
    </div>
{/if}
