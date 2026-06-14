<script lang="ts">
    import { getSelectableDurationUnits } from '@zarf/core/constants/time';
    import { MAX_EPOCHS } from '@zarf/core/domain/epochDiscovery';
    import type { DurationUnit } from '@zarf/core/utils/vesting';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenNumberInput from '@zarf/ui/components/ui/ZenNumberInput.svelte';
    import ZenSelect from '@zarf/ui/components/ui/ZenSelect.svelte';

    let { duration = $bindable(), durationUnit = $bindable() } = $props<{
        duration: number;
        durationUnit: DurationUnit;
    }>();

    // --- Derived for clean markup ---
    const isInstantUnlock = $derived(duration === 0);

    // Sub-day units (minutes/hours) are demo/test-only — show them in dev and on
    // any non-mainnet network, hide them from the production (mainnet) picker.
    const includeSubDay = $derived(import.meta.env.DEV || networkStore.activeId !== 'mainnet');
    const units = $derived(getSelectableDurationUnits(includeSubDay));

    // Each duration increment is one unlock epoch (one merkle leaf per recipient,
    // one client-side hash-chain step). The claim-side discovery loop is capped at
    // MAX_EPOCHS, so anything beyond it would silently strand the later unlocks.
    const epochsOverCap = $derived(duration > MAX_EPOCHS);
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
                options={units}
                size="xl"
                variant="ghost"
                aria-label="Duration Unit"
            />
        </div>

        <!-- Quick Unit Selectors -->
        <div class="flex items-center gap-2">
            {#each units as unit, i (i)}
                <ZenButton
                    variant={durationUnit === unit.value ? 'primary' : 'ghost'}
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
                        Tokens unlock in full <b>{durationUnit}</b> batches only. There is no
                        continuous streaming; users must complete a full {durationUnit.slice(0, -1)} to
                        claim that period's allocation.
                    </p>
                </div>
            </div>
        {/if}

        {#if epochsOverCap}
            <div
                class="p-3 border border-zen-warning/40 bg-zen-warning/[0.06] rounded-xl text-xs text-zen-warning font-medium"
            >
                This schedule has {duration} unlock periods; the maximum is {MAX_EPOCHS}. Reduce the
                duration or choose a coarser unit (e.g. weeks or months).
            </div>
        {/if}
    </div>
</div>
