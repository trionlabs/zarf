<script lang="ts">
    /**
     * DistributionSchedule.svelte
     *
     * Orchestrator component for the Schedule step.
     * Composes 3 atomic sub-components and the VestingTimeline preview.
     *
     * Architecture: Orchestrator Pattern (fe_new.md 4.2)
     * - PoolAmountInput: Token amount with percentage presets
     * - CliffDatePicker: Date/time selection with quick presets
     * - VestingDurationPicker: Duration and unit selection
     */
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { fade } from "svelte/transition";
    import VestingTimeline from "$lib/components/wizard/VestingTimeline.svelte";
    import type { DurationUnit } from "$lib/utils/vesting";

    // Sub-components (Atomic)
    import PoolAmountInput from "./PoolAmountInput.svelte";
    import CliffDatePicker from "./CliffDatePicker.svelte";
    import VestingDurationPicker from "./VestingDurationPicker.svelte";

    let {
        poolAmount = $bindable(),
        poolInputValue = $bindable(),
        cliffDate = $bindable(),
        cliffTime = $bindable(),
        duration = $bindable(),
        durationUnit = $bindable(),
    } = $props<{
        poolAmount: number;
        poolInputValue: string;
        cliffDate: string;
        cliffTime: string;
        duration: number;
        durationUnit: DurationUnit;
    }>();

    // Derived for template
    const tokenSymbol = $derived(
        wizardStore.tokenDetails.tokenSymbol || "TOKENS",
    );
    const hasCliffDate = $derived(cliffDate !== "");
</script>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">
    <!-- LEFT COLUMN: Control Deck (40%) -->
    <div class="lg:col-span-5 space-y-10 py-4">
        <!-- Phase 1: Distribution Pool -->
        <PoolAmountInput bind:poolAmount bind:poolInputValue />

        <!-- Phase 2: Lock Period -->
        <CliffDatePicker bind:cliffDate bind:cliffTime />

        <!-- Phase 3: Vesting Rules -->
        <VestingDurationPicker bind:duration bind:durationUnit />
    </div>

    <!-- RIGHT COLUMN: Output Deck (60%) -->
    <div
        class="lg:col-span-7 pt-4 border-l border-base-content/5 pl-12 relative hidden lg:block"
    >
        <div class="sticky top-12">
            {#if hasCliffDate}
                <div in:fade={{ duration: 400 }}>
                    <VestingTimeline
                        cliffEndDate={cliffDate}
                        {cliffTime}
                        {duration}
                        {durationUnit}
                        totalTokens={poolAmount}
                        {tokenSymbol}
                    />

                    <!-- Footer Note -->
                    <div
                        class="mt-8 pt-8 border-t border-base-content/5 flex items-center justify-between text-xs text-base-content/30 uppercase tracking-widest"
                    >
                        <span>Simulated Schedule</span>
                        <span>Zarf Protocol v1.0</span>
                    </div>
                </div>
            {:else}
                <div
                    class="h-96 flex flex-col items-center justify-center text-center opacity-30 space-y-4"
                >
                    <div class="text-base-content/20 text-4xl font-light">
                        ?
                    </div>
                    <p
                        class="text-sm font-medium tracking-widest uppercase text-base-content/40"
                    >
                        Select Start Date
                    </p>
                </div>
            {/if}
        </div>
    </div>
</div>
