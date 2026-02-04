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
    import { wizardStore } from "../../../stores/wizardStore.svelte";
    import { fade } from "svelte/transition";
    import VestingTimeline from "../../../components/wizard/VestingTimeline.svelte";
    import type { DurationUnit } from "@zarf/core/utils/vesting";

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

<div class="space-y-4">
    <!-- Phase 1: Distribution Pool -->
    <PoolAmountInput bind:poolAmount bind:poolInputValue />

    <!-- Phase 2: Lock Period -->
    <CliffDatePicker bind:cliffDate bind:cliffTime />

    <!-- Phase 3: Vesting Rules -->
    <VestingDurationPicker bind:duration bind:durationUnit />
</div>
