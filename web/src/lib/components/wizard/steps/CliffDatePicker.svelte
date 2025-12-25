<script lang="ts">
    import {
        MONTH_NAMES,
        CLIFF_PRESETS,
        TIME_PRESETS,
    } from "$lib/constants/time";
    import {
        toIsoDate,
        fromIsoDate,
        getTodayIso,
        addMonthsToToday,
    } from "$lib/utils/date";

    let { cliffDate = $bindable(), cliffTime = $bindable() } = $props<{
        cliffDate: string;
        cliffTime: string;
    }>();

    // --- Local UI State ---
    let selectedMonth = $state(new Date().getMonth());
    let selectedDay = $state(new Date().getDate());
    let selectedYear = $state(new Date().getFullYear());
    let isEditingTime = $state(false);

    /**
     * Bidirectional Sync: cliffDate prop <-> selectedMonth/Day/Year local state
     *
     * NOTE: Using $effect here is intentional and acceptable per fe_new.md 2.2.
     * This is NOT syncing two local states - it's syncing a PROP (cliffDate) to local UI state.
     * The local state (selectedMonth/Day/Year) is user-editable, so $derived cannot be used.
     * This pattern is required when:
     * 1. Parent can change the prop (e.g., preset button clicks)
     * 2. Child can also modify the value (e.g., user typing in inputs)
     */
    $effect(() => {
        if (cliffDate) {
            const { year, month, day } = fromIsoDate(cliffDate);
            selectedMonth = month;
            selectedDay = day;
            selectedYear = year;
        }
    });

    // --- Actions ---
    function updateCliffDate() {
        const iso = toIsoDate(selectedYear, selectedMonth, selectedDay);
        if (iso) {
            cliffDate = iso;
        }
    }

    function handleYearInput(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        if (target.value.length > 4) {
            target.value = target.value.slice(0, 4);
        }
        updateCliffDate();
    }

    // --- Derived for clean markup ---
    const today = getTodayIso();
    const isPastDate = $derived(cliffDate !== "" && cliffDate < today);
    const dateInputClass = $derived(isPastDate ? "text-error" : "");
</script>

<div class="pt-8 border-t border-base-content/5 space-y-6">
    <h3
        class="text-xs font-semibold uppercase tracking-widest text-base-content/40 flex items-center gap-2"
    >
        <span
            class="w-4 h-4 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center"
            >2</span
        >
        Lock Period
    </h3>

    <!-- Date Input (Month · Day, Year) -->
    <div
        class="flex items-center gap-1 text-3xl font-light text-base-content font-mono"
    >
        <select
            bind:value={selectedMonth}
            onchange={updateCliffDate}
            aria-label="Month"
            class="appearance-none bg-transparent outline-none cursor-pointer hover:text-primary transition-colors font-medium {dateInputClass}"
        >
            {#each MONTH_NAMES as m, i}
                <option value={i}>{m}</option>
            {/each}
        </select>
        <span class="text-base-content/20">·</span>
        <input
            type="number"
            bind:value={selectedDay}
            oninput={updateCliffDate}
            min="1"
            max="31"
            aria-label="Day"
            class="w-12 bg-transparent outline-none text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none {dateInputClass}"
        />
        <span class="text-base-content/20">,</span>
        <input
            type="number"
            bind:value={selectedYear}
            oninput={handleYearInput}
            min="2024"
            max="2100"
            aria-label="Year"
            class="w-20 bg-transparent outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none {dateInputClass}"
        />
    </div>

    {#if isPastDate}
        <p class="text-xs text-error font-medium">
            Past dates cannot be selected.
        </p>
    {/if}

    <!-- Quick Date Presets + Time Selector -->
    <div class="flex items-center gap-3 text-xs text-base-content/40">
        {#each CLIFF_PRESETS as preset}
            {@const presetDate = addMonthsToToday(preset.months)}
            <button
                type="button"
                class="hover:text-primary transition-colors {cliffDate ===
                presetDate
                    ? 'text-primary font-medium'
                    : ''}"
                onclick={() => (cliffDate = presetDate)}
            >
                {preset.label}
            </button>
        {/each}
        <span class="text-base-content/20">|</span>

        <!-- Time with hover-to-edit -->
        {#if isEditingTime}
            <div class="flex items-center gap-1">
                {#each TIME_PRESETS as time}
                    <button
                        type="button"
                        class="px-1.5 py-0.5 rounded transition-all {cliffTime ===
                        time
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-base-content/5'}"
                        onclick={() => {
                            cliffTime = time;
                            isEditingTime = false;
                        }}
                    >
                        {time}
                    </button>
                {/each}
                <button
                    type="button"
                    class="text-base-content/20 hover:text-base-content/40"
                    onclick={() => (isEditingTime = false)}>✕</button
                >
            </div>
        {:else}
            <button
                type="button"
                class="group flex items-center gap-1 text-base-content/30 hover:text-primary transition-colors"
                onclick={() => (isEditingTime = true)}
            >
                <span>{cliffTime} UTC</span>
                <span
                    class="opacity-0 group-hover:opacity-100 text-xs text-primary"
                    >edit</span
                >
            </button>
        {/if}
    </div>
</div>
