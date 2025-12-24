<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    onMount(() => {
        wizardStore.goToStep(5);
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
            goto("/wizard/step-6");
        } catch (e: unknown) {
            deployStatus = "Deployment failed. Please try again.";
            isDeploying = false;
        }
    }

    function handleBack() {
        wizardStore.previousStep();
        goto("/wizard/step-4");
    }
</script>

<div class="space-y-6">
    <div class="text-center">
        <h2 class="text-2xl font-bold">Review & Deploy</h2>
        <p class="text-base-content/70">
            Verify the details before deployment.
        </p>
    </div>

    <div class="grid md:grid-cols-2 gap-4">
        <!-- Token Info -->
        <div class="card bg-base-200">
            <div class="card-body p-6">
                <h3 class="card-title text-sm uppercase opacity-60">
                    Token Details
                </h3>
                <dl class="space-y-2 text-sm">
                    <div>
                        <dt class="opacity-70 font-medium">Name</dt>
                        <dd class="font-bold">
                            {wizardStore.tokenDetails.distributionName}
                        </dd>
                    </div>
                    <div>
                        <dt class="opacity-70 font-medium">Contract</dt>
                        <dd class="font-mono text-xs break-all">
                            {wizardStore.tokenDetails.tokenAddress}
                        </dd>
                    </div>
                    <div>
                        <dt class="opacity-70 font-medium">
                            Total Distribution
                        </dt>
                        <dd class="font-mono font-bold">
                            {wizardStore.totalRecipientsAmount.toLocaleString()}
                        </dd>
                    </div>
                </dl>
            </div>
        </div>

        <!-- Schedule Info -->
        <div class="card bg-base-200">
            <div class="card-body p-6">
                <h3 class="card-title text-sm uppercase opacity-60">
                    Schedule
                </h3>
                <dl class="space-y-2 text-sm">
                    <div>
                        <dt class="opacity-70 font-medium">Cliff End Date</dt>
                        <dd class="font-bold">
                            {wizardStore.schedule.cliffEndDate}
                        </dd>
                    </div>
                    <div>
                        <dt class="opacity-70 font-medium">Duration</dt>
                        <dd class="font-bold">
                            {wizardStore.schedule.distributionDurationMonths} Months
                        </dd>
                    </div>
                    <div>
                        <dt class="opacity-70 font-medium">Vesting Type</dt>
                        <dd>Linear Vesting</dd>
                    </div>
                </dl>
            </div>
        </div>
    </div>

    <!-- Whitelist Summary -->
    <div class="card bg-base-200">
        <div class="card-body p-6 flex flex-row items-center justify-between">
            <div>
                <h3 class="card-title text-sm uppercase opacity-60 mb-1">
                    Recipients
                </h3>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-lg"
                        >{wizardStore.recipients.length}</span
                    >
                    <span class="opacity-70"
                        >entries from <span class="font-mono text-xs"
                            >{wizardStore.csvFilename}</span
                        ></span
                    >
                </div>
            </div>
            <button class="btn btn-sm btn-outline" onclick={handleBack}
                >Edit</button
            >
        </div>
    </div>

    <!-- Deploy Actions -->
    <div class="card-actions justify-between mt-8 items-center">
        <button
            class="btn btn-ghost"
            onclick={handleBack}
            disabled={isDeploying}
        >
            ← Back
        </button>

        <div class="flex flex-col items-end gap-2">
            <button
                class="btn btn-primary min-w-[150px]"
                disabled={isDeploying}
                onclick={handleDeploy}
            >
                {#if isDeploying}
                    <span class="loading loading-spinner"></span>
                {:else}
                    Deploy Contract
                {/if}
            </button>
            {#if deployStatus}
                <span class="text-xs font-mono text-primary animate-pulse"
                    >{deployStatus}</span
                >
            {/if}
        </div>
    </div>
</div>
