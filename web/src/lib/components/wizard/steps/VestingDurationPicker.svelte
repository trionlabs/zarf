<script lang="ts">
    import { DURATION_UNITS } from "$lib/constants/time";
    import type { DurationUnit } from "$lib/utils/vesting";

    let { duration = $bindable(), durationUnit = $bindable() } = $props<{
        duration: number;
        durationUnit: DurationUnit;
    }>();

    // --- Derived for clean markup ---
    const isInstantUnlock = $derived(duration === 0);

    function getUnitButtonClass(unitValue: string): string {
        return durationUnit === unitValue
            ? "bg-primary text-primary-content shadow-lg shadow-primary/20"
            : "bg-base-content/5 text-base-content/60 hover:bg-base-content/10";
    }
</script>

<div class="pt-8 border-t border-base-content/5 space-y-6">
    <h3
        class="text-xs font-semibold uppercase tracking-widest text-base-content/40 flex items-center gap-2"
    >
        <span
            class="w-4 h-4 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center"
            >3</span
        >
        Vesting Rules
    </h3>

    <div class="space-y-6">
        <!-- Duration Input Row -->
        <div class="flex items-baseline gap-3">
            <input
                type="number"
                bind:value={duration}
                min="0"
                placeholder="0"
                aria-label="Vesting Duration"
                class="input input-ghost h-auto p-0 rounded-none w-24 text-3xl font-light font-mono border-b-2 border-base-content/10 focus:border-primary/50 focus:bg-transparent outline-none transition-colors text-right placeholder:text-base-content/20"
            />

            <!-- Unit Select -->
            <div class="relative inline-block">
                <select
                    bind:value={durationUnit}
                    aria-label="Duration Unit"
                    class="appearance-none bg-transparent text-3xl font-light text-base-content/20 hover:text-primary transition-colors cursor-pointer outline-none pr-6 text-left w-auto"
                    style="text-align-last: left;"
                >
                    {#each DURATION_UNITS as u}
                        <option value={u.value}>{u.label}</option>
                    {/each}
                </select>
            </div>
        </div>

        <!-- Quick Unit Selectors -->
        <div class="flex items-center gap-3 mt-4">
            {#each DURATION_UNITS as unit}
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-xs font-medium transition-all {getUnitButtonClass(
                        unit.value,
                    )}"
                    onclick={() => (durationUnit = unit.value as DurationUnit)}
                >
                    {unit.label}
                </button>
            {/each}
        </div>

        {#if isInstantUnlock}
            <p class="text-xs text-primary font-medium mt-4">
                Tokens will unlock instantly after lock period
            </p>
        {/if}
    </div>
</div>
