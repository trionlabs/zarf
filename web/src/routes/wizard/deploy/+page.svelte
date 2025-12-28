<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import type { Distribution } from "$lib/stores/types";

    import DeployStep1 from "$lib/components/wizard/deploy/DeployStep1.svelte";
    import DeployStep2Backup from "$lib/components/wizard/deploy/DeployStep2Backup.svelte";
    import DeployStep3Connect from "$lib/components/wizard/deploy/DeployStep3Connect.svelte";
    import DeployStep4Deploy from "$lib/components/wizard/deploy/DeployStep4Deploy.svelte";

    // Route state
    const distributionId = $derived($page.url.searchParams.get("id"));
    const distribution = $derived(
        wizardStore.distributions.find((d) => d.id === distributionId),
    );

    // Deploy Store State (Direct Access)
    const currentStep = $derived(deployStore.currentStep);

    // Navigation Guards
    const canStep2 = $derived(deployStore.canContinueToStep2);
    const canStep3 = $derived(deployStore.canContinueToStep3);
    const canStep4 = $derived(deployStore.canContinueToStep4);

    // Derived UI State
    const showLoading = $derived(!distribution);
    const showStep1 = $derived(currentStep === 1);
    const showStep2 = $derived(currentStep === 2);
    const showStep3 = $derived(currentStep === 3);
    const showStep4 = $derived(currentStep === 4);

    const showContinue = $derived(currentStep < 4);
    const backButtonText = $derived(currentStep === 1 ? "Cancel" : "Back");

    const isStep1 = $derived(currentStep >= 1);
    const isStep2 = $derived(currentStep >= 2);
    const isStep3 = $derived(currentStep >= 3);
    const isStep4 = $derived(currentStep >= 4);

    // Navigation Logic
    const continueDisabled = $derived.by(() => {
        if (currentStep === 1) return !canStep2;
        if (currentStep === 2) return !canStep3;
        if (currentStep === 3) return !canStep4;
        return false;
    });

    // Initialize Store
    $effect(() => {
        if (distribution && deployStore.distribution?.id !== distributionId) {
            // Guard: don't re-init if deployed
            if (distribution.state === "launched") {
                alert("This distribution is already deployed.");
                goto("/distributions");
                return;
            }
            deployStore.initDistribution(distribution);
        }
    });

    onMount(() => {
        if (!distributionId) {
            goto("/distributions");
        }
    });

    function goBack() {
        if (currentStep === 1) {
            goto("/distributions");
        } else {
            deployStore.prevStep();
        }
    }

    function goNext() {
        deployStore.nextStep();
    }
</script>

<div class="max-w-4xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between">
        <div>
            <h1
                class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent"
            >
                Deploy Distribution
            </h1>
            {#if distribution}
                <p class="text-base-content/60 mt-1">
                    Deploying <span class="text-primary font-bold"
                        >{distribution.name}</span
                    >
                </p>
            {/if}
        </div>
        <div class="text-sm font-mono opacity-50">
            ID: {distributionId?.slice(0, 8)}...
        </div>
    </div>

    <!-- Stepper -->
    <ul class="steps steps-vertical lg:steps-horizontal w-full mb-8">
        <li class="step" class:step-primary={isStep1}>Prepare</li>
        <li class="step" class:step-primary={isStep2}>Backup</li>
        <li class="step" class:step-primary={isStep3}>Approvals</li>
        <li class="step" class:step-primary={isStep4}>Deploy</li>
    </ul>

    <!-- Step Content -->
    <div
        class="bg-base-100 border border-base-300 rounded-xl shadow-lg min-h-[400px]"
    >
        {#if showLoading}
            <div class="flex items-center justify-center h-[400px]">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
        {:else if showStep1}
            <DeployStep1 />
        {:else if showStep2}
            <DeployStep2Backup />
        {:else if showStep3}
            <DeployStep3Connect />
        {:else if showStep4}
            <DeployStep4Deploy />
        {/if}
    </div>

    <!-- Navigation Actions -->
    <div class="mt-6 flex justify-between">
        <button class="btn btn-ghost gap-2" onclick={goBack}>
            ← {backButtonText}
        </button>

        {#if showContinue}
            <button
                class="btn btn-primary gap-2"
                onclick={goNext}
                disabled={continueDisabled}
            >
                Continue →
            </button>
        {/if}
    </div>
</div>
