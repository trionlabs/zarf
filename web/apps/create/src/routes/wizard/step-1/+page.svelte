<script lang="ts">
    import { wizardStore } from '$lib/stores/wizardStore.svelte';
    import { goto } from '$app/navigation';
    import { page, navigating } from '$app/state';
    import { onMount } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { ArrowRight, Eye, Calendar } from 'lucide-svelte';
    import type { Recipient, Distribution, DistributionDraft } from '$lib/stores/types';
    import type { DurationUnit } from '@zarf/core/utils/vesting';
    import { CREATION_STEPS } from '@zarf/core/constants/wizard';

    // Sub-components
    import DistributionIdentity from '$lib/components/wizard/steps/DistributionIdentity.svelte';
    import DistributionSchedule from '$lib/components/wizard/steps/DistributionSchedule.svelte';
    import DistributionRecipients from '$lib/components/wizard/steps/DistributionRecipients.svelte';
    import VestingTimeline from '$lib/components/wizard/VestingTimeline.svelte'; // Import Chart
    import MicroStepProgress from '$lib/components/wizard/MicroStepProgress.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';

    onMount(() => {
        // restore() is idempotent; must run BEFORE the guard since a child's onMount
        // fires before the root layout's restore() — otherwise a hard load / deep-link
        // reads an un-restored (empty) store and wrongly bounces to step-0.
        wizardStore.restore();

        // Guard: redirect if no token, or if an imported token wasn't acknowledged.
        // step-0 commits the acknowledgement to the store on Continue, so a direct
        // navigation / deep-link here re-asserts the trust gate instead of relying on
        // step-0's ephemeral in-memory check.
        const td = wizardStore.tokenDetails;
        if (!td.tokenAddress || (td.trust === 'imported' && !td.acknowledged)) {
            goto('/wizard/step-0');
            return;
        }
        wizardStore.goToStep(1);

        const d = wizardStore.draft;
        if (d) {
            name = d.name;
            description = d.description;
            usRestricted = d.usRestricted;
            euRestricted = d.euRestricted;
            poolAmount = d.poolAmount;
            poolInputValue = d.poolInputValue;
            cliffDate = d.cliffDate;
            cliffTime = d.cliffTime;
            duration = d.duration;
            durationUnit = d.durationUnit;
            csvFileName = d.csvFileName;
        }
        hydrated = true;
    });

    // --- State Management ---
    let hydrated = $state(false);

    // Form Data
    let name = $state('');
    let description = $state('');
    let usRestricted = $state(false);
    let euRestricted = $state(false);

    let poolAmount = $state<number>(0);
    let poolInputValue = $state<string>('');

    let cliffDate = $state<string>(new Date().toISOString().split('T')[0]);
    let cliffTime = $state<string>('12:00');
    let duration = $state<number>(12);
    let durationUnit = $state<DurationUnit>('months');

    let recipients = $state<Recipient[]>([]);
    let csvFileName = $state<string | null>(null);
    let csvError = $state<string | null>(null);
    let isProcessingCSV = $state(false);
    let validationErrors = $state<string[]>([]);

    const totalAmount = $derived(
        recipients.reduce((sum: number, r: Recipient) => sum + r.amount, 0),
    );

    // Compare allocations at the token's base-unit granularity so float summation
    // artifacts (e.g. 33.3333333 × 3 vs a 99.9999999 pool) don't spuriously fail an
    // exactly balanced distribution. The deploy still runs an exact integer
    // allocations-vs-total integrity check as the final guard.
    const tokenDecimals = $derived(wizardStore.tokenDetails.tokenDecimals ?? 7);
    const toBaseUnits = (n: number) => Math.round(n * 10 ** tokenDecimals);

    // --- Validation ---
    const isStep0Valid = $derived(name.length >= 3);
    const isStep1Valid = $derived(cliffDate !== '' && duration >= 0 && poolAmount > 0);
    const isBudgetMatch = $derived(
        poolAmount > 0 && toBaseUnits(totalAmount) === toBaseUnits(poolAmount),
    );
    const isStep2Valid = $derived(
        recipients.length > 0 && isBudgetMatch && validationErrors.length === 0,
    );
    const isFormValid = $derived(isStep0Valid && isStep1Valid && isStep2Valid);

    // --- Micro-step routing (URL-driven via ?s=) ---
    const STEP_SLUGS = ['identity', 'schedule', 'recipients'] as const;
    const microSteps = CREATION_STEPS.map((s) => s.label);
    const stepSubtitles = [
        'Name this distribution and set who can claim.',
        'Set the pool size and vesting schedule.',
        'Add recipients and allocate the pool.',
    ];

    const requestedStep = $derived.by(() => {
        const idx = (STEP_SLUGS as readonly string[]).indexOf(page.url.searchParams.get('s') ?? '');
        return idx === -1 ? 0 : idx;
    });
    // Furthest step reachable given current data — blocks deep-linking past empty steps.
    const maxReachableStep = $derived(!isStep0Valid ? 0 : !isStep1Valid ? 1 : 2);
    const creationStep = $derived(Math.min(requestedStep, maxReachableStep));

    function buildStepUrl(idx: number): string {
        const url = new URL(page.url);
        url.searchParams.set('s', STEP_SLUGS[idx]);
        return url.pathname + url.search;
    }
    function goToMicroStep(idx: number, opts: { replace: boolean }) {
        goto(buildStepUrl(idx), { replaceState: opts.replace, keepFocus: true, noScroll: true });
    }

    const microSegments = $derived(
        microSteps.map((label, i) => ({
            label,
            href: i < creationStep ? buildStepUrl(i) : null,
            complete: i < creationStep,
        })),
    );

    const launchBlocker = $derived(
        !isStep0Valid
            ? 'Add a distribution name (at least 3 characters).'
            : !isStep1Valid
              ? 'Set a pool amount and vesting schedule.'
              : recipients.length === 0
                ? 'Add at least one recipient.'
                : !isBudgetMatch
                  ? 'Recipient allocations must total the pool amount.'
                  : validationErrors.length > 0
                    ? 'Resolve recipient errors before launching.'
                    : '',
    );

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

    // Canonicalize the URL to the effective (clamped) micro-step. Gated so it
    // never fights hydration or clobbers an in-flight push navigation.
    $effect(() => {
        if (!hydrated || navigating.to) return;
        const canonical = STEP_SLUGS[creationStep];
        if (page.url.searchParams.get('s') !== canonical) {
            goto(buildStepUrl(creationStep), {
                replaceState: true,
                keepFocus: true,
                noScroll: true,
            });
        }
    });

    // Persist the in-progress form as a draft so a reload/deep-link restores it.
    // Recipients are intentionally excluded (large; already in saved distributions).
    let draftTimer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
        if (!hydrated) return;
        const snapshot: DistributionDraft = {
            name,
            description,
            usRestricted,
            euRestricted,
            poolAmount,
            poolInputValue,
            cliffDate,
            cliffTime,
            duration,
            durationUnit,
            csvFileName,
        };
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => wizardStore.setDraft(snapshot), 300);
        return () => clearTimeout(draftTimer);
    });

    // --- Actions ---
    function saveDistribution() {
        if (!isFormValid) return;
        const regulatoryRules: string[] = [];
        if (usRestricted) regulatoryRules.push('US_RESTRICTED');
        if (euRestricted) regulatoryRules.push('EU_RESTRICTED');

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
            state: 'created',
            createdAt: new Date().toISOString(),
        };

        wizardStore.addDistribution(newDist);
        wizardStore.clearEditingState();
        wizardStore.clearDraft();

        // Redirect to distributions page after saving
        goto('/distributions');
    }

    // Initialize editing state on mount
    $effect.root(() => {
        wizardStore.setEditingVestingDuration(duration);
        wizardStore.setEditingDurationUnit(durationUnit);
    });

    const creationSteps = CREATION_STEPS;
</script>

<svelte:head>
    <title>{microSteps[creationStep]} — Create Distribution — Zarf</title>
    <meta name="description" content="Step 2 of 3: {stepSubtitles[creationStep]}" />
</svelte:head>

<h1 class="sr-only">Create Distribution — Step 2 of 3: {microSteps[creationStep]}</h1>

<div class="flex flex-col lg:flex-row gap-8 items-start p-2">
    <!-- LEFT COLUMN: Form Wizard -->
    <div class="flex-1 w-full lg:max-w-xl flex flex-col min-h-[400px]">
        <!-- Header: selected-token chip + named sub-progress -->
        <div class="flex items-center justify-between gap-3 mb-4">
            <!-- Token chip: persistent token context + change affordance, all steps/breakpoints -->
            <div
                class="inline-flex items-center gap-2 bg-zen-fg/5 rounded-full pl-1.5 pr-1 py-1 border border-zen-border-subtle"
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
                <span class="text-xs font-semibold">{wizardStore.tokenDetails.tokenSymbol}</span>
                <button
                    class="text-[10px] font-medium text-zen-fg-subtle hover:text-zen-fg px-1.5 py-0.5 rounded-full hover:bg-zen-fg/5 transition-colors"
                    onclick={() => goto('/wizard/step-0')}
                >
                    Change
                </button>
            </div>

            <MicroStepProgress segments={microSegments} current={creationStep} />
        </div>

        <!-- Dynamic Title -->
        <div class="mb-4">
            <h2 class="text-xl font-semibold mb-1" in:fade>
                {creationSteps[creationStep].label}
            </h2>
            <p class="text-zen-fg-muted text-sm">
                {stepSubtitles[creationStep]}
            </p>
        </div>

        <!-- Form Content -->
        <div class="flex-1 relative">
            {#if creationStep === 0}
                <div in:slide={{ duration: 200, axis: 'x' }}>
                    <DistributionIdentity
                        bind:name
                        bind:description
                        bind:usRestricted
                        bind:euRestricted
                    />
                </div>
            {:else if creationStep === 1}
                <div in:slide={{ duration: 300, axis: 'x' }}>
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
                <div in:slide={{ duration: 200, axis: 'x' }}>
                    <DistributionRecipients
                        bind:recipients
                        bind:csvFileName
                        bind:csvError
                        bind:isProcessingCSV
                        bind:validationErrors
                        {poolAmount}
                        unlockEvents={duration}
                        tokenSymbol={wizardStore.tokenDetails.tokenSymbol || 'TOKENS'}
                    />
                </div>
            {/if}
        </div>

        <!-- Action Bar -->
        <div
            class="mt-12 pt-6 border-t border-zen-border-subtle flex items-center {creationStep > 0
                ? 'justify-between'
                : 'justify-end'}"
        >
            {#if creationStep > 0}
                <ZenButton
                    variant="ghost"
                    onclick={() => goToMicroStep(creationStep - 1, { replace: false })}
                    >Back</ZenButton
                >
            {/if}

            {#if creationStep < 2}
                {@const isCurrentStepValid = creationStep === 0 ? isStep0Valid : isStep1Valid}
                <ZenButton
                    variant="primary"
                    size="lg"
                    disabled={!isCurrentStepValid}
                    onclick={() => goToMicroStep(creationStep + 1, { replace: false })}
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
                        Launch Distribution
                    </ZenButton>
                    {#if launchBlocker}
                        <span class="text-xs text-zen-fg-muted px-1">
                            {launchBlocker}
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
            class="bg-zen-bg border border-zen-border-subtle rounded-2xl shadow-sm overflow-hidden relative"
        >
            <!-- Card Header -->
            <div class="p-6 border-b border-zen-border-subtle relative bg-zen-bg">
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
                <h3 class="text-xl font-bold leading-tight mb-2 min-h-[1.75rem] transition-all">
                    {#if name}
                        {name}
                    {:else}
                        <span class="opacity-20 italic">Untitled distribution</span>
                    {/if}
                </h3>

                <!-- Description Preview -->
                <p class="text-sm text-zen-fg/60 min-h-[3rem] line-clamp-2">
                    {#if description}
                        {description}
                    {:else}
                        <span class="opacity-20 italic">No description yet.</span>
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
                        Vesting Schedule
                    </div>
                    <VestingTimeline
                        cliffEndDate={cliffDate}
                        {cliffTime}
                        {duration}
                        {durationUnit}
                        totalTokens={poolAmount}
                        tokenSymbol={wizardStore.tokenDetails.tokenSymbol || undefined}
                    />
                {:else}
                    <!-- Fallback Placeholder for Step 0 -->
                    <div
                        class="h-40 flex flex-col items-center justify-center text-center opacity-40 bg-zen-fg/[0.02] rounded-2xl"
                    >
                        <Calendar class="w-8 h-8 mb-2 opacity-50" />
                        <span class="text-xs font-medium">Schedule not set yet</span>
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
