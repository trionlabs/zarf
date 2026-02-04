<script lang="ts">
    import {
        MONTH_NAMES,
        CLIFF_PRESETS,
        TIME_PRESETS,
    } from "@zarf/core/constants/time";
    import {
        toIsoDate,
        fromIsoDate,
        getTodayIso,
        addMonthsToToday,
    } from "@zarf/core/utils/date";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenNumberInput from "@zarf/ui/components/ui/ZenNumberInput.svelte";
    import ZenSelect from "@zarf/ui/components/ui/ZenSelect.svelte";

    import { untrack } from "svelte";

    let { cliffDate = $bindable(), cliffTime = $bindable() } = $props<{
        cliffDate: string;
        cliffTime: string;
    }>();

    // --- Local UI State ---
    // Initialize with safe defaults, will be synced by effect immediately
    let selectedMonth = $state(new Date().getMonth());
    let selectedDay = $state(new Date().getDate());
    let selectedYear = $state(new Date().getFullYear());
    let isEditingTime = $state(false);

    /**
     * Bidirectional Sync: cliffDate prop -> local UI state
     * Using untrack to prevent cyclic formatting loops while keeping UI in sync with external changes.
     */
    $effect(() => {
        // We track cliffDate changes
        const iso = cliffDate;

        untrack(() => {
            if (iso) {
                const { year, month, day } = fromIsoDate(iso);
                // Only update local state if different to avoid cursor jumps or unnecessary renders
                if (selectedYear !== year) selectedYear = year;
                if (selectedMonth !== month) selectedMonth = month;
                if (selectedDay !== day) selectedDay = day;
            }
        });
    });

    // --- Synchronization: Local State -> Prop ---
    // Watch for changes in local state and update the parent prop
    $effect(() => {
        // Dependencies
        const year = selectedYear;
        const month = selectedMonth;
        const day = selectedDay;

        untrack(() => {
            // Validate Year Length cap
            if (String(year).length > 4) {
                selectedYear = Number(String(year).slice(0, 4));
                return; // Will re-trigger
            }

            // Construct ISO date
            const iso = toIsoDate(year, month, day);
            if (iso && iso !== cliffDate) {
                cliffDate = iso;
            }
        });
    });

    // --- Derived for clean markup ---
    const today = getTodayIso();
    const monthOptions = MONTH_NAMES.map((m: string, i: number) => ({
        value: i,
        label: m,
    }));
</script>

<div class="pt-4 border-t border-zen-border-subtle space-y-3">
    <h3 class="zen-section-label">Lock Period</h3>

    <!-- Date Input (Month · Day, Year) -->
    <div
        class="flex items-center gap-2 text-4xl font-medium tracking-tighter leading-none text-zen-fg"
    >
        <ZenSelect
            bind:value={selectedMonth}
            options={monthOptions}
            size="xl"
            variant="ghost"
            aria-label="Month"
            class="-ml-1"
        />
        <span class="text-zen-fg/20">·</span>
        <ZenNumberInput
            bind:value={selectedDay}
            min={1}
            max={31}
            size="xl"
            variant="ghost"
            align="center"
            aria-label="Day"
            class="w-16"
        />
        <span class="text-zen-fg/20 font-light">,</span>
        <ZenNumberInput
            bind:value={selectedYear}
            min={2020}
            max={2100}
            size="xl"
            variant="ghost"
            align="center"
            aria-label="Year"
            class="w-24"
        />
    </div>

    <!-- Quick Date Presets + Time Selector -->
    <div class="flex items-center gap-2 text-xs text-zen-fg-subtle">
        {#each CLIFF_PRESETS as preset}
            {@const presetDate = addMonthsToToday(preset.months)}
            <ZenButton
                variant={cliffDate === presetDate ? "primary" : "ghost"}
                size="sm"
                class="px-3 rounded-full text-xs font-medium"
                onclick={() => (cliffDate = presetDate)}
            >
                {preset.label}
            </ZenButton>
        {/each}
        <span class="text-zen-fg/20">|</span>

        <!-- Time with hover-to-edit -->
        {#if isEditingTime}
            <div class="flex items-center gap-1">
                {#each TIME_PRESETS as time}
                    <ZenButton
                        variant={cliffTime === time ? "primary" : "ghost"}
                        size="sm"
                        class="px-2 py-1 rounded-lg text-xs font-medium"
                        onclick={() => {
                            cliffTime = time;
                            isEditingTime = false;
                        }}
                    >
                        {time}
                    </ZenButton>
                {/each}
                <ZenButton
                    variant="ghost"
                    size="sm"
                    class="text-zen-fg/20 hover:text-zen-fg/40 px-2"
                    onclick={() => (isEditingTime = false)}>✕</ZenButton
                >
            </div>
        {:else}
            <button
                type="button"
                class="group flex items-center gap-2 text-zen-fg-subtle hover:text-zen-fg transition-colors"
                onclick={() => (isEditingTime = true)}
            >
                <span
                    class="font-medium text-xs bg-zen-fg/5 px-2 py-1 rounded-lg hover:bg-zen-fg/10 transition-colors"
                    >{cliffTime} UTC</span
                >
            </button>
        {/if}
    </div>
</div>
