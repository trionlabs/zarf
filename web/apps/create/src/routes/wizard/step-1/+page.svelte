<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { fade, slide } from "svelte/transition";
    import {
        ArrowRight,
        ArrowLeft,
        Sparkles,
        Check,
        X,
        Eye,
        Calendar,
        Users,
    } from "lucide-svelte";
    import type { WhitelistEntry, Distribution } from "$lib/stores/types";
    import type { DurationUnit } from "@zarf/core/utils/vesting";
    import { CREATION_STEPS } from "@zarf/core/constants/wizard";

    // Sub-components
    import DistributionIdentity from "$lib/components/wizard/steps/DistributionIdentity.svelte";
    import DistributionSchedule from "$lib/components/wizard/steps/DistributionSchedule.svelte";
    import DistributionRecipients from "$lib/components/wizard/steps/DistributionRecipients.svelte";
    import VestingTimeline from "$lib/components/wizard/VestingTimeline.svelte"; // Import Chart
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    onMount(() => {
        // Guard: Redirect if no token entered
        if (!wizardStore.tokenDetails.tokenAddress) {
            goto("/wizard/step-0");
            return;
        }
        wizardStore.goToStep(1);
    });

    // --- State Management ---
    let creationStep = $state(0);

    // Form Data
    let name = $state("");
    let description = $state("");
    let usRestricted = $state(false);
    let euRestricted = $state(false);

    let poolAmount = $state<number>(0);
    let poolInputValue = $state<string>("");

    let cliffDate = $state<string>(new Date().toISOString().split("T")[0]);
    let cliffTime = $state<string>("12:00");
    let duration = $state<number>(12);
    let durationUnit = $state<DurationUnit>("months");

    let recipients = $state<WhitelistEntry[]>([]);
    let csvFileName = $state<string | null>(null);
    let csvError = $state<string | null>(null);
    let isProcessingCSV = $state(false);
    let validationErrors = $state<string[]>([]);

    const totalAmount = $derived(
        recipients.reduce(
            (sum: number, r: WhitelistEntry) => sum + r.amount,
            0,
        ),
    );

    // --- Validation ---
    const isStep0Valid = $derived(name.length >= 3);
    const isStep1Valid = $derived(
        cliffDate !== "" && duration >= 0 && poolAmount > 0,
    );
    const isBudgetMatch = $derived(
        poolAmount > 0 && totalAmount === poolAmount,
    );
    const isStep2Valid = $derived(
        recipients.length > 0 && isBudgetMatch && validationErrors.length === 0,
    );
    const isFormValid = $derived(isStep0Valid && isStep1Valid && isStep2Valid);

    // Sync editing states with StatsPanel
    $effect(() => {
        wizardStore.setEditingPoolAmount(poolAmount);
    });
    $effect(() => {
        wizardStore.setEditingVestingDuration(duration);
    });
    $effect(() => {
        wizardStore.setEditingRecipientCount(recipients.length);
    });
    $effect(() => {
        wizardStore.setEditingCliffDate(cliffDate);
    });
    $effect(() => {
        wizardStore.setEditingDurationUnit(durationUnit);
    });

    // --- Actions ---
    function resetForm() {
        name = "";
        description = "";
        cliffDate = "";
        duration = 12;
        poolAmount = 0;
        poolInputValue = "";
        recipients = [];
        csvFileName = null;
        csvError = null;
        validationErrors = [];
        usRestricted = false;
        euRestricted = false;
        creationStep = 0;
        wizardStore.clearEditingState();
    }

    function cancelCreation() {
        resetForm();
        goto("/distributions");
    }

    function saveDistribution() {
        if (!isFormValid) return;
        const regulatoryRules: string[] = [];
        if (usRestricted) regulatoryRules.push("US_RESTRICTED");
        if (euRestricted) regulatoryRules.push("EU_RESTRICTED");

        const newDist: Distribution = {
            id: crypto.randomUUID(),
            name,
            description,
            amount: poolAmount.toString(),
            schedule: {
                cliffEndDate: cliffDate,
                cliffTime: cliffTime,
                distributionDuration: duration,
                durationUnit: durationUnit,
            },
            recipients,
            csvFilename: csvFileName,
            regulatoryRules,
            state: "created",
            createdAt: new Date().toISOString(),
        };

        wizardStore.addDistribution(newDist);
        wizardStore.clearEditingState();

        // Redirect to distributions page after saving
        goto("/distributions");
    }

    // Initialize editing state on mount
    $effect.root(() => {
        wizardStore.setEditingVestingDuration(duration);
        wizardStore.setEditingDurationUnit(durationUnit);
    });

    const creationSteps = CREATION_STEPS;
</script>

<div class="flex flex-col lg:flex-row gap-8 items-start p-2">
    <!-- LEFT COLUMN: Form Wizard -->
    <div class="flex-1 w-full lg:max-w-xl flex flex-col min-h-[400px]">
        <!-- Header / Back -->
        <div class="flex items-center justify-between mb-4">
            <button
                class="flex items-center gap-2 text-sm text-zen-fg-subtle hover:text-zen-fg transition-colors"
                onclick={() => goto("/wizard/step-0")}
            >
                <ArrowLeft class="w-4 h-4" />
                <span>Change Token</span>
            </button>

            <!-- Tiny Step Indicator -->
            <div class="text-xs font-mono text-zen-fg-muted">
                {creationStep + 1} / {creationSteps.length}
            </div>
        </div>

        <!-- Dynamic Title -->
        <div class="mb-4">
            <h2 class="text-xl font-semibold mb-1" in:fade>
                {creationSteps[creationStep].label}
            </h2>
            <p class="text-zen-fg-muted text-sm">
                Configure the details for your new token distribution.
            </p>
        </div>

        <!-- Form Content -->
        <div class="flex-1 relative">
            {#if creationStep === 0}
                <div in:slide={{ duration: 200, axis: "x" }}>
                    <DistributionIdentity
                        bind:name
                        bind:description
                        bind:usRestricted
                        bind:euRestricted
                    />
                </div>
            {:else if creationStep === 1}
                <div in:slide={{ duration: 300, axis: "x" }}>
                    <DistributionSchedule
                        bind:poolAmount
                        bind:poolInputValue
                        bind:cliffDate
                        bind:cliffTime
                        bind:duration
                        bind:durationUnit
                    />
                </div>
            {:else if creationStep === 2}
                <div in:slide={{ duration: 200, axis: "x" }}>
                    <DistributionRecipients
                        bind:recipients
                        bind:csvFileName
                        bind:csvError
                        bind:isProcessingCSV
                        bind:validationErrors
                        {totalAmount}
                        {poolAmount}
                        unlockEvents={duration}
                        tokenSymbol={wizardStore.tokenDetails.tokenSymbol ||
                            "TOKENS"}
                    />
                </div>
            {/if}
        </div>

        <!-- Action Bar -->
        <div
            class="mt-12 pt-6 border-t border-zen-border-subtle flex items-center {creationStep >
            0
                ? 'justify-between'
                : 'justify-end'}"
        >
            {#if creationStep > 0}
                <ZenButton variant="ghost" onclick={() => creationStep--}>
                    Back
                </ZenButton>
            {/if}

            {#if creationStep < 2}
                {@const isCurrentStepValid =
                    creationStep === 0 ? isStep0Valid : isStep1Valid}
                <ZenButton
                    variant="primary"
                    size="lg"
                    disabled={!isCurrentStepValid}
                    onclick={() => creationStep++}
                    class="px-8"
                >
                    Continue <ArrowRight class="w-4 h-4 ml-2" />
                </ZenButton>
            {:else}
                <div class="flex flex-col items-end gap-2">
                    <ZenButton
                        variant="primary"
                        size="lg"
                        disabled={!isFormValid}
                        onclick={saveDistribution}
                        class="px-8 w-full sm:w-auto"
                    >
                        <Sparkles class="w-4 h-4 mr-2" /> Launch Distribution
                    </ZenButton>
                    {#if !isFormValid}
                        <span
                            class="text-[10px] text-zen-fg-muted font-medium px-1 animate-pulse"
                        >
                            Complete requirements to launch
                        </span>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    <!-- RIGHT COLUMN: Live Preview (Sticky) -->
    <div class="hidden lg:block w-full max-w-sm sticky top-24">
        <!-- Preview Label -->
        <div
            class="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-zen-fg-subtle ml-1"
        >
            <Eye class="w-3.5 h-3.5" /> Live Preview
        </div>

        <!-- The Card -->
        <div
            class="bg-zen-bg border border-zen-border-subtle rounded-3xl shadow-xl overflow-hidden relative group"
        >
            <!-- decorative blurred blob inside preview -->
            <div
                class="absolute -top-10 -right-10 w-32 h-32 bg-zen-primary/10 rounded-full blur-[40px] pointer-events-none"
            ></div>

            <!-- Card Header -->
            <div
                class="p-6 border-b border-zen-border-subtle relative bg-zen-bg/50 backdrop-blur-sm"
            >
                <!-- Token Badge -->
                <div
                    class="inline-flex items-center gap-2 bg-zen-fg/5 rounded-full px-2.5 py-1 mb-4 border border-zen-border-subtle"
                >
                    {#if wizardStore.tokenDetails.iconUrl}
                        <img
                            src={wizardStore.tokenDetails.iconUrl}
                            alt=""
                            class="w-4 h-4 rounded-full"
                        />
                    {:else}
                        <div
                            class="w-4 h-4 rounded-full bg-zen-primary flex items-center justify-center text-[8px] text-zen-primary-content font-bold"
                        >
                            {wizardStore.tokenDetails.tokenSymbol?.charAt(0)}
                        </div>
                    {/if}
                    <span class="text-[10px] font-bold opacity-70"
                        >{wizardStore.tokenDetails.tokenSymbol}</span
                    >
                </div>

                <!-- Title Preview -->
                <h3
                    class="text-xl font-bold leading-tight mb-2 min-h-[1.75rem] transition-all"
                >
                    {#if name}
                        {name}
                    {:else}
                        <span class="opacity-20 italic">Untitled Event</span>
                    {/if}
                </h3>

                <!-- Description Preview -->
                <p
                    class="text-sm text-zen-fg/60 min-h-[3rem] line-clamp-2"
                >
                    {#if description}
                        {description}
                    {:else}
                        <span class="opacity-20 italic"
                            >No description provided yet...</span
                        >
                    {/if}
                </p>
            </div>

            <!-- Card Body: VESTING CHART INTEGRATION -->
            <div class="p-6">
                <!-- If we are in Step 1 (Schedule) or 2 (Recipients), show the chart -->
                {#if creationStep >= 1}
                    <div
                        class="mb-4 text-[10px] uppercase font-bold tracking-widest text-zen-fg-muted"
                    >
                        Distribution Projection
                    </div>
                    <VestingTimeline
                        cliffEndDate={cliffDate}
                        {cliffTime}
                        {duration}
                        {durationUnit}
                        totalTokens={poolAmount}
                        tokenSymbol={wizardStore.tokenDetails.tokenSymbol ||
                            undefined}
                    />
                {:else}
                    <!-- Fallback Placeholder for Step 0 -->
                    <div
                        class="h-40 flex flex-col items-center justify-center text-center opacity-40 bg-zen-fg/[0.02] rounded-2xl"
                    >
                        <Calendar class="w-8 h-8 mb-2 opacity-50" />
                        <span class="text-xs font-medium"
                            >Schedule not configured</span
                        >
                    </div>
                {/if}
            </div>

            <!-- Warning Footer -->
            {#if usRestricted || euRestricted}
                <div
                    class="p-4 bg-zen-warning/5 text-zen-warning text-xs font-medium text-center border-t border-zen-warning/5"
                >
                    Regulatory Restrictions Apply
                </div>
            {/if}
        </div>

    </div>
</div>
