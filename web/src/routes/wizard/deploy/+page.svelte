<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import PageHeader from "$lib/components/ui/PageHeader.svelte";
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

<div
    class="h-full flex flex-col relative max-w-5xl w-full px-4 md:px-0 transition-all duration-300 ml-0"
>
    <!-- Header -->
    <PageHeader
        title="Deploy Distribution"
        description={distribution
            ? `Deploying ${distribution.name}`
            : "Finalize and launch your token distribution"}
    >
        {#snippet extra()}
            <div
                class="px-3 py-1 rounded-full bg-base-200/50 text-xs font-mono text-base-content/40"
            >
                ID: {distributionId?.slice(0, 8)}
            </div>
        {/snippet}
    </PageHeader>

    <!-- Stepper (Minimal) -->
    <div class="flex items-center gap-2 mb-10">
        {#each [{ id: 1, label: "Prepare" }, { id: 2, label: "Backup" }, { id: 3, label: "Approvals" }, { id: 4, label: "Deploy" }] as step, i}
            {@const isActive = currentStep === step.id}
            {@const isPast = currentStep > step.id}

            <div class="flex items-center">
                <div
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-300
                    {isActive
                        ? 'bg-primary/5 text-primary font-medium ring-1 ring-primary/20'
                        : ''}
                    {isPast ? 'text-success' : ''}
                    {!isActive && !isPast ? 'text-base-content/30' : ''}"
                >
                    {#if isPast}
                        <svg
                            class="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    {:else}
                        <span class="text-xs font-mono opacity-60"
                            >{step.id}</span
                        >
                    {/if}
                    <span>{step.label}</span>
                </div>

                {#if i < 3}
                    <div class="w-4 h-px bg-base-content/10 mx-1"></div>
                {/if}
            </div>
        {/each}
    </div>

    <!-- Step Content -->
    <div class="flex-1 min-h-[400px]">
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

    <!-- Navigation Footer -->
    <footer
        class="flex items-center justify-between pt-10 mt-auto border-t border-base-content/5"
    >
        <button
            class="btn btn-ghost gap-2 text-base-content/50 hover:text-base-content"
            onclick={goBack}
        >
            ← {backButtonText}
        </button>

        {#if showContinue}
            <button
                class="btn btn-primary px-8 rounded-lg shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/20 transition-all transform active:scale-95 disabled:shadow-none"
                onclick={goNext}
                disabled={continueDisabled}
            >
                Continue <span class="ml-1">→</span>
            </button>
        {/if}
    </footer>
</div>
