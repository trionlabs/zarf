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
    } from "$lib/utils/vesting";

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
    const hasValidDates = $derived(cliffDate !== null && daysToCliff >= 0);

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
</script>

{#if hasValidDates}
    <div class="space-y-10">
        <!-- Header Metrics -->
        <div class="space-y-6">
            <!-- Primary Stats Row -->
            <div class="grid grid-cols-2 gap-6">
                <div>
                    <p
                        class="text-[10px] text-base-content/30 uppercase tracking-widest mb-1"
                    >
                        Lock Period
                    </p>
                    <p class="text-2xl font-light tabular-nums">
                        {daysToCliff}<span
                            class="text-sm text-base-content/40 ml-1">days</span
                        >
                    </p>
                    <p class="text-xs text-base-content/40 mt-0.5">
                        until {formatDateShort(cliffDate)}
                    </p>
                </div>
                <div>
                    <p
                        class="text-[10px] text-base-content/30 uppercase tracking-widest mb-1"
                    >
                        Vesting Duration
                    </p>
                    {#if isInstant}
                        <p class="text-2xl font-light text-warning">Instant</p>
                        <p class="text-xs text-base-content/40 mt-0.5">
                            100% at cliff end
                        </p>
                    {:else}
                        <p class="text-2xl font-light tabular-nums">
                            {duration}<span
                                class="text-sm text-base-content/40 ml-1"
                                >{durationUnit}</span
                            >
                        </p>
                        <p class="text-xs text-base-content/40 mt-0.5">
                            {frequencyLabel} unlocks
                        </p>
                    {/if}
                </div>
            </div>

            <!-- Token Amounts (if provided) -->
            {#if totalTokens > 0}
                <div
                    class="flex items-center gap-8 py-3 px-4 bg-base-content/[0.02] rounded-lg"
                >
                    <div>
                        <p
                            class="text-[10px] text-base-content/30 uppercase tracking-widest"
                        >
                            Total
                        </p>
                        <p class="text-lg font-medium tabular-nums">
                            {formatNumber(totalTokens)}
                            <span class="text-xs text-base-content/40"
                                >{tokenSymbol}</span
                            >
                        </p>
                    </div>
                    <div class="text-base-content/20">→</div>
                    <div>
                        <p
                            class="text-[10px] text-base-content/30 uppercase tracking-widest"
                        >
                            Per Unlock
                        </p>
                        <p class="text-lg font-medium tabular-nums">
                            {formatNumber(tokensPerUnlock)}
                            <span class="text-xs text-base-content/40"
                                >{tokenSymbol}</span
                            >
                        </p>
                    </div>
                    <div class="ml-auto text-right">
                        <p
                            class="text-[10px] text-base-content/30 uppercase tracking-widest"
                        >
                            Events
                        </p>
                        <p class="text-lg font-medium tabular-nums">
                            {unlockEvents}<span
                                class="text-xs text-base-content/40 ml-1"
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
                    class="text-[10px] font-semibold uppercase tracking-widest text-base-content/30"
                >
                    Unlock Schedule
                </h4>
                <div class="flex gap-4 text-[10px] text-base-content/40">
                    <span class="flex items-center gap-1.5">
                        <div
                            class="w-2 h-2 bg-base-content/10 rounded-sm"
                        ></div>
                        Locked
                    </span>
                    <span class="flex items-center gap-1.5">
                        <div class="w-2 h-2 bg-primary rounded-sm"></div>
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
                        <div class="w-full h-px bg-base-content/5"></div>
                    {/each}
                </div>

                <!-- Lock Period Bar -->
                {#if showLockPeriodBar}
                    <div
                        class="h-full bg-base-content/[0.03] rounded flex items-center justify-center relative group cursor-default"
                        style="width: {lockPeriodPercent}%; min-width: 40px;"
                    >
                        <Lock class="w-4 h-4 text-base-content/20" />

                        <!-- Lock Tooltip -->
                        <div
                            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                        >
                            <div
                                class="bg-base-content text-base-100 text-[10px] px-2 py-1.5 rounded shadow-lg whitespace-nowrap text-center"
                            >
                                <div class="font-medium">Lock Period</div>
                                <div class="text-base-100/70">
                                    {daysToCliff} days
                                </div>
                                <div class="text-base-100/50 text-[9px] mt-0.5">
                                    Ends {formatDateShort(cliffDate)} @ {formatTime(
                                        cliffTime,
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Vesting Bars -->
                {#each unlockMarkers as marker, i}
                    <div
                        class="h-full flex-1 flex flex-col justify-end group relative cursor-default min-w-[4px]"
                    >
                        <div
                            class="w-full bg-primary/80 transition-all duration-200 rounded-t group-hover:bg-primary"
                            style="height: {marker.percent}%"
                        ></div>

                        <!-- Hover Tooltip -->
                        <div
                            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                        >
                            <div
                                class="bg-base-content text-base-100 text-[10px] px-2.5 py-2 rounded shadow-lg whitespace-nowrap"
                            >
                                <div class="font-semibold text-center mb-1">
                                    {#if isInstant}
                                        Instant Unlock
                                    {:else}
                                        {marker.isGrouped
                                            ? `Events 1-${marker.event}`
                                            : `Unlock #${marker.event}`}
                                    {/if}
                                </div>
                                <div class="space-y-0.5 text-center">
                                    <div class="text-primary-content/90">
                                        {marker.percent}% unlocked
                                    </div>
                                    {#if totalTokens > 0}
                                        <div class="text-base-100/70">
                                            {formatNumber(marker.tokens)}
                                            {tokenSymbol}
                                        </div>
                                    {/if}
                                    {#if marker.date}
                                        <div
                                            class="text-base-100/50 text-[9px] pt-1 border-t border-base-100/20"
                                        >
                                            {formatDateLong(marker.date)}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>

            <!-- X-Axis -->
            <div
                class="flex justify-between text-[10px] text-base-content/30 pt-2 border-t border-base-content/5"
            >
                <div>
                    <div class="font-medium">Today</div>
                    <div class="text-[9px] text-base-content/20">
                        {formatDateShort(today)}
                    </div>
                </div>
                {#if !isInstant}
                    <div class="text-center">
                        <div class="font-medium">Cliff Ends</div>
                        <div class="text-[9px] text-base-content/20">
                            {formatDateShort(cliffDate)}
                        </div>
                    </div>
                {/if}
                <div class="text-right">
                    <div class="font-medium">
                        {isInstant ? "100% Unlocked" : "Fully Vested"}
                    </div>
                    <div class="text-[9px] text-base-content/20">
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
