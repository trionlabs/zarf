<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { Check, ArrowRight, Loader2 } from "lucide-svelte";
    import { fly } from "svelte/transition";

    onMount(() => {
        wizardStore.goToStep(3);
    });

    let isDeploying = $state(false);
    let deployStatus = $state("");

    async function handleDeploy() {
        isDeploying = true;
        deployStatus = "Generating Merkle Tree...";

        // Simulation of deployment process
        try {
            await new Promise((r) => setTimeout(r, 1000));

            deployStatus = "Deploying Vesting Contract...";
            await new Promise((r) => setTimeout(r, 1500));

            deployStatus = "Verifying Contract...";
            await new Promise((r) => setTimeout(r, 1000));

            deployStatus = "Success!";
            wizardStore.nextStep();
            goto("/wizard/step-4");
        } catch (e: unknown) {
            deployStatus = "Deployment failed. Please try again.";
            isDeploying = false;
        }
    }

    function handleBack() {
        wizardStore.previousStep();
        goto("/wizard/step-2");
    }
</script>

<div class="h-full flex flex-col justify-center max-w-4xl mx-auto py-8">
    <div class="mb-12 text-center">
        <h2 class="text-4xl font-light tracking-tight text-base-content mb-3">
            Review & Deploy
        </h2>
        <p class="text-lg text-base-content/50 font-light tracking-wide">
            Verify your configuration before launching.
        </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <!-- Token Summary -->
        <div class="card bg-base-100/40 border border-base-content/10 shadow-sm p-6 space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-[0.2em] opacity-40">Configuration</h3>
            
            <div class="space-y-3">
                <div class="flex justify-between items-center py-2 border-b border-base-content/5">
                    <span class="opacity-60 text-sm">Token Name</span>
                    <span class="font-medium">{wizardStore.tokenDetails.distributionName}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-base-content/5">
                    <span class="opacity-60 text-sm">Contract</span>
                    <span class="font-mono text-xs opacity-80">{wizardStore.tokenDetails.tokenAddress}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-base-content/5">
                    <span class="opacity-60 text-sm">Total Supply</span>
                    <span class="font-mono font-medium">{wizardStore.tokenDetails.totalAmount}</span>
                </div>
            </div>
        </div>

        <!-- Schedule & Distribution -->
        <div class="card bg-base-100/40 border border-base-content/10 shadow-sm p-6 space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-[0.2em] opacity-40">Distribution</h3>
            
            <div class="space-y-3">
                 <div class="flex justify-between items-center py-2 border-b border-base-content/5">
                    <span class="opacity-60 text-sm">Recipients</span>
                    <span class="font-medium">{wizardStore.recipients.length} entries</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-base-content/5">
                    <span class="opacity-60 text-sm">Cliff Date</span>
                    <span class="font-mono font-medium">{wizardStore.schedule.cliffEndDate}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-base-content/5">
                    <span class="opacity-60 text-sm">Vesting</span>
                    <span class="font-medium">{wizardStore.schedule.distributionDurationMonths} Months (Linear)</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Disclaimer -->
    <div role="alert" class="alert bg-info/5 border-info/20 text-sm mb-12 text-base-content/70">
        <Check class="w-5 h-5 text-info" />
        <span>Deployment is irreversible. Please verify all details above.</span>
    </div>

    <!-- Actions -->
    <div class="flex justify-between items-center pt-8 border-t border-base-content/5">
         <button class="btn btn-ghost hover:bg-base-content/5" onclick={handleBack}>
            Back
        </button>

        <div class="flex flex-col items-end gap-2">
            <button
                class="btn btn-primary h-14 px-10 rounded-full shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300 text-lg font-medium tracking-wide min-w-[200px]"
                disabled={isDeploying}
                onclick={handleDeploy}
            >
                {#if isDeploying}
                    <Loader2 class="w-5 h-5 animate-spin mr-2" />
                    {deployStatus}
                {:else}
                    Deploy Contract
                    <ArrowRight class="w-5 h-5 ml-2" />
                {/if}
            </button>
        </div>
    </div>
</div>
