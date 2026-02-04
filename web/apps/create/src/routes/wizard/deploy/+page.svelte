<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenSpinner from "@zarf/ui/components/ui/ZenSpinner.svelte";
    import type { Distribution } from "$lib/stores/types";
    import { Check } from "lucide-svelte";

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
    <!-- Header + Stepper - Only show when not deployed -->
    {#if !deployStore.isDeployed}
        <!-- Compact Header Row -->
        <div class="flex items-center justify-between mb-4">
            <div>
                <h1 class="text-xl font-bold text-zen-fg">Deploy Distribution</h1>
                <p class="text-sm text-zen-fg-muted">{distribution?.name || "Finalize and launch"}</p>
            </div>
            <div class="px-3 py-1 rounded-full bg-zen-fg/5 text-xs font-mono text-zen-fg-faint">
                ID: {distributionId?.slice(0, 8)}
            </div>
        </div>

        <!-- Stepper (Minimal) -->
        <div class="flex items-center gap-2 mb-6">
            {#each [{ id: 1, label: "Prepare" }, { id: 2, label: "Backup" }, { id: 3, label: "Approvals" }, { id: 4, label: "Deploy" }] as step, i}
                {@const isActive = currentStep === step.id}
                {@const isPast = currentStep > step.id}

                <div class="flex items-center">
                    <div
                        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-300
                        {isActive
                            ? 'bg-zen-fg/5 text-zen-fg font-medium ring-1 ring-zen-fg/20'
                            : ''}
                        {isPast ? 'text-zen-success' : ''}
                        {!isActive && !isPast ? 'text-zen-fg-faint' : ''}"
                    >
                        {#if isPast}
                            <Check class="w-3.5 h-3.5" />
                        {:else}
                            <span class="text-xs font-mono opacity-60"
                                >{step.id}</span
                            >
                        {/if}
                        <span>{step.label}</span>
                    </div>

                    {#if i < 3}
                        <div class="w-4 h-px bg-zen-border mx-1"></div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}

    <!-- Step Content -->
    <div class="flex-1 min-h-[300px]">
        {#if showLoading}
            <div class="flex items-center justify-center h-[400px]">
                <ZenSpinner size="lg" />
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

    <!-- Navigation Footer - Hide when deployed -->
    {#if !deployStore.isDeployed}
        <footer
            class="flex items-center justify-between pt-6 mt-auto border-t-[0.5px] border-zen-border-subtle"
        >
            <ZenButton variant="ghost" onclick={goBack}>
                <span class="mr-1">←</span> {backButtonText}
            </ZenButton>

            {#if showContinue}
                <ZenButton
                    variant="primary"
                    size="lg"
                    class="px-8"
                    onclick={goNext}
                    disabled={continueDisabled}
                >
                    Continue <span class="ml-1">→</span>
                </ZenButton>
            {/if}
        </footer>
    {/if}
</div>
