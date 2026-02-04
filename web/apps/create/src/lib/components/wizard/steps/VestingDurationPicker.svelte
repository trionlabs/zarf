<script lang="ts">
    import { DURATION_UNITS } from "@zarf/core/constants/time";
    import type { DurationUnit } from "@zarf/core/utils/vesting";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenNumberInput from "@zarf/ui/components/ui/ZenNumberInput.svelte";
    import ZenSelect from "@zarf/ui/components/ui/ZenSelect.svelte";

    let { duration = $bindable(), durationUnit = $bindable() } = $props<{
        duration: number;
        durationUnit: DurationUnit;
    }>();

    // --- Derived for clean markup ---
    const isInstantUnlock = $derived(duration === 0);
</script>

<div class="pt-4 border-t border-zen-border-subtle space-y-3">
    <h3 class="zen-section-label">Vesting Rules</h3>

    <div class="space-y-3">
        <!-- Duration Input Row -->
        <div class="flex items-baseline gap-2">
            <ZenNumberInput
                bind:value={duration}
                min={0}
                size="xl"
                variant="ghost"
                align="right"
                placeholder="0"
                aria-label="Vesting Duration"
                class="w-24"
            />

            <!-- Unit Select -->
            <ZenSelect
                bind:value={durationUnit}
                options={DURATION_UNITS}
                size="xl"
                variant="ghost"
                aria-label="Duration Unit"
            />
        </div>

        <!-- Quick Unit Selectors -->
        <div class="flex items-center gap-2">
            {#each DURATION_UNITS as unit}
                <ZenButton
                    variant={durationUnit === unit.value ? "primary" : "ghost"}
                    size="sm"
                    class="px-3 rounded-full text-xs font-medium"
                    onclick={() => (durationUnit = unit.value as DurationUnit)}
                >
                    {unit.label}
                </ZenButton>
            {/each}
        </div>

        {#if isInstantUnlock}
            <p class="text-xs text-zen-primary font-medium">
                Tokens will unlock instantly after lock period
            </p>
        {:else}
            <div
                class="p-3 border border-zen-warning/10 bg-zen-warning/[0.02] rounded-xl flex gap-2 items-start"
            >
                <div class="mt-0.5 grayscale opacity-70">⚠️</div>
                <div class="text-xs space-y-1 text-zen-warning/80">
                    <p class="font-bold">Discrete Periodic Unlocks</p>
                    <p class="leading-relaxed opacity-90">
                        Tokens unlock in full <b>{durationUnit}</b> batches
                        only. There is no continuous streaming; users must
                        complete a full {durationUnit.slice(0, -1)} to claim that
                        period's allocation.
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>
