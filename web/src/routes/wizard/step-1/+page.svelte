<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { fade, slide } from "svelte/transition";
    import {
        ArrowRight,
        ArrowLeft,
        Edit2,
        ChevronRight,
        Sparkles,
        Plus,
        Trash2,
        Check,
        X,
    } from "lucide-svelte";
    import type { WhitelistEntry, Distribution } from "$lib/stores/types";
    import type { DurationUnit } from "$lib/utils/vesting";
    import { CREATION_STEPS } from "$lib/constants/wizard";

    // Sub-components
    import DistributionIdentity from "$lib/components/wizard/steps/DistributionIdentity.svelte";
    import DistributionSchedule from "$lib/components/wizard/steps/DistributionSchedule.svelte";
    import DistributionRecipients from "$lib/components/wizard/steps/DistributionRecipients.svelte";

    onMount(() => {
        // Guard: Redirect if no token entered
        if (!wizardStore.tokenDetails.tokenAddress) {
            goto("/wizard/step-0");
            return;
        }
        wizardStore.goToStep(1);
    });

    // --- State Management ---
    let viewMode = $state<"list" | "create">("list");
    let creationStep = $state(0);

    // Form Data
    let name = $state("");
    let description = $state("");
    let usRestricted = $state(false);
    let euRestricted = $state(false);

    let poolAmount = $state<number>(0);
    let poolInputValue = $state<string>("");

    let cliffDate = $state<string>("");
    let cliffTime = $state<string>("12:00");
    let duration = $state<number>(12);
    let durationUnit = $state<DurationUnit>("months");

    let recipients = $state<WhitelistEntry[]>([]);
    let csvFileName = $state<string | null>(null);
    let csvError = $state<string | null>(null);
    let isProcessingCSV = $state(false);

    const totalAmount = $derived(
        recipients.reduce((sum, r) => sum + r.amount, 0),
    );

    // --- Validation ---
    const today = new Date().toISOString().split("T")[0];
    const isPastDate = $derived(cliffDate !== "" && cliffDate < today);

    const isStep0Valid = $derived(name.length >= 3);
    const isStep1Valid = $derived(
        cliffDate !== "" && !isPastDate && duration >= 0 && poolAmount > 0,
    );
    const isStep2Valid = $derived(recipients.length > 0);
    const isFormValid = $derived(isStep0Valid && isStep1Valid && isStep2Valid);

    // Sync StatsPanel
    $effect(() => {
        wizardStore.setEditingPoolAmount(poolAmount);
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
        usRestricted = false;
        euRestricted = false;
        creationStep = 0;
        wizardStore.setEditingPoolAmount(0);
    }

    function startCreation() {
        resetForm();
        viewMode = "create";
    }

    function cancelCreation() {
        viewMode = "list";
        resetForm();
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
                distributionDurationMonths: duration,
            },
            recipients,
            csvFilename: csvFileName,
            regulatoryRules,
        };

        wizardStore.addDistribution(newDist);
        viewMode = "list";
    }

    // Use imported constant for step configuration
    const creationSteps = CREATION_STEPS;
</script>

<div class="min-h-[70vh] flex flex-col">
    <!-- Cover Header: Full Width -->
    <div
        class="-mx-8 lg:-mx-12 -mt-8 lg:-mt-12 px-8 lg:px-12 py-5 mb-8 border-b border-base-content/5 flex items-center justify-between"
    >
        <div class="flex items-center gap-4">
            <button
                class="btn btn-circle btn-ghost btn-sm -ml-2 text-base-content/40 hover:text-base-content"
                onclick={() => goto("/wizard/step-0")}
                aria-label="Go back to token selection"
            >
                <ArrowLeft class="w-4 h-4" />
            </button>
            <div class="flex items-center gap-3">
                {#if wizardStore.tokenDetails.iconUrl}
                    <img
                        src={wizardStore.tokenDetails.iconUrl}
                        alt=""
                        class="w-6 h-6 rounded-full"
                    />
                {:else}
                    <div
                        class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold"
                    >
                        {wizardStore.tokenDetails.tokenSymbol?.charAt(0) || "?"}
                    </div>
                {/if}
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium"
                        >{wizardStore.tokenDetails.tokenName}</span
                    >
                    <span
                        class="text-[10px] font-mono text-base-content/30 bg-base-content/5 px-1.5 py-0.5 rounded"
                    >
                        {wizardStore.tokenDetails.tokenSymbol}
                    </span>
                </div>
            </div>
        </div>
        {#if viewMode === "list"}
            <button
                class="text-[11px] text-base-content/40 hover:text-primary transition-colors flex items-center gap-1 uppercase tracking-widest font-medium"
                onclick={() => goto("/wizard/step-0")}
            >
                <Edit2 class="w-3 h-3" /> Change
            </button>
        {/if}
    </div>

    <!-- MAIN CONTENT -->
    <div class="max-w-5xl w-full">
        {#if viewMode === "list"}
            <!-- LIST VIEW -->
            <div class="flex-1 flex flex-col" in:fade={{ duration: 200 }}>
                <header class="mb-8">
                    <h1 class="text-xl font-semibold tracking-tight">
                        Distributions
                    </h1>
                    <p class="text-sm text-base-content/40 mt-1">
                        Create and manage token distribution schedules
                    </p>
                </header>

                <div class="flex-1">
                    {#if wizardStore.distributions.length === 0}
                        <!-- Empty State -->
                        <button
                            class="w-full group border-2 border-dashed border-base-content/10 round-xl p-10 text-center hover:bg-primary/[0.02] hover:border-primary/30 transition-all"
                            onclick={startCreation}
                        >
                            <div
                                class="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform"
                            >
                                <Plus
                                    class="w-5 h-5 text-primary/60 group-hover:text-primary"
                                />
                            </div>
                            <h3
                                class="font-medium text-base-content/70 group-hover:text-base-content"
                            >
                                Create your first distribution
                            </h3>
                        </button>
                    {:else}
                        <div class="space-y-3">
                            {#each wizardStore.distributions as dist (dist.id)}
                                <div
                                    class="group flex items-center gap-4 p-4 rounded-xl border border-base-content/5 bg-base-100/50 hover:bg-base-100 transition-all"
                                >
                                    <div
                                        class="w-9 h-9 rounded-lg bg-primary/5 flex items-center justify-center text-primary font-semibold text-sm shrink-0"
                                    >
                                        {dist.name.charAt(0)}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h3
                                            class="font-medium text-sm truncate"
                                        >
                                            {dist.name}
                                        </h3>
                                        <div
                                            class="flex items-center gap-3 mt-0.5 text-[11px] text-base-content/40"
                                        >
                                            <span class="font-mono"
                                                >{Number(
                                                    dist.amount,
                                                ).toLocaleString()}
                                                {wizardStore.tokenDetails
                                                    .tokenSymbol}</span
                                            >
                                            <span>•</span>
                                            <span
                                                >{dist.schedule
                                                    .distributionDurationMonths}mo
                                                vesting</span
                                            >
                                            <span>•</span>
                                            <span
                                                >{dist.recipients.length} recipients</span
                                            >
                                        </div>
                                    </div>
                                    <button
                                        class="opacity-0 group-hover:opacity-100 text-error/60 hover:text-error p-1.5 transition-all"
                                        onclick={() =>
                                            wizardStore.removeDistribution(
                                                dist.id,
                                            )}
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                            {/each}
                            <button
                                class="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-base-content/10 text-sm hover:text-primary hover:border-primary/30 transition-all"
                                onclick={startCreation}
                            >
                                <Plus class="w-4 h-4" /> Add another
                            </button>
                        </div>
                    {/if}
                </div>

                {#if wizardStore.distributions.length > 0}
                    <footer
                        class="mt-8 pt-6 border-t border-base-content/5 flex justify-end"
                    >
                        <button
                            class="btn btn-neutral btn-sm"
                            onclick={() => {
                                wizardStore.nextStep();
                                goto("/wizard/step-2");
                            }}
                        >
                            Continue to Review <ArrowRight
                                class="w-4 h-4 ml-2"
                            />
                        </button>
                    </footer>
                {/if}
            </div>
        {:else}
            <!-- CREATE VIEW (Orchestrator) -->
            <div class="flex-1 flex flex-col" in:fade={{ duration: 200 }}>
                <!-- Header -->
                <header class="flex items-center justify-between mb-10">
                    <div class="flex items-center gap-6">
                        <h2 class="text-lg font-semibold">New Distribution</h2>
                        <!-- Stepper -->
                        <div class="flex items-center">
                            {#each creationSteps as step, idx}
                                <div class="flex items-center">
                                    <div
                                        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all {idx ===
                                        creationStep
                                            ? 'text-primary bg-primary/5'
                                            : idx < creationStep
                                              ? 'text-success'
                                              : 'text-base-content/30'}"
                                    >
                                        {#if idx < creationStep}
                                            <Check class="w-3 h-3" />
                                        {:else}
                                            <span class="w-4 text-center"
                                                >{step.shortLabel}</span
                                            >
                                        {/if}
                                        <span class="hidden sm:inline"
                                            >{step.label}</span
                                        >
                                    </div>
                                    {#if idx < creationSteps.length - 1}
                                        <ChevronRight
                                            class="w-3.5 h-3.5 mx-1 text-base-content/15"
                                        />
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                    <button
                        class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/30 hover:text-base-content"
                        onclick={cancelCreation}
                    >
                        <X class="w-4 h-4" />
                    </button>
                </header>

                <!-- Sub-Components -->
                <div class="flex-1">
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
                                {totalAmount}
                            />
                        </div>
                    {/if}
                </div>

                <!-- Nav Footer -->
                <footer
                    class="mt-10 pt-6 border-t border-base-content/5 flex items-center justify-between"
                >
                    <button
                        class="flex items-center gap-2 text-sm text-base-content/40 hover:text-base-content disabled:opacity-30"
                        disabled={creationStep === 0}
                        onclick={() => creationStep--}
                    >
                        <ArrowLeft class="w-4 h-4" /> Back
                    </button>
                    {#if creationStep < 2}
                        <button
                            class="btn btn-sm btn-primary min-w-[100px]"
                            disabled={creationStep === 0
                                ? !isStep0Valid
                                : !isStep1Valid}
                            onclick={() => creationStep++}
                        >
                            Next <ArrowRight class="w-4 h-4 ml-1" />
                        </button>
                    {:else}
                        <button
                            class="btn btn-sm btn-primary min-w-[140px]"
                            disabled={!isFormValid}
                            onclick={saveDistribution}
                        >
                            <Sparkles class="w-4 h-4 mr-1" /> Add Distribution
                        </button>
                    {/if}
                </footer>
            </div>
        {/if}
    </div>
</div>
