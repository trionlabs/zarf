<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import {
        Check,
        ArrowRight,
        Loader2,
        List,
        Calendar,
        Users,
        Wallet,
    } from "lucide-svelte";

    onMount(() => {
        wizardStore.goToStep(2);
    });

    let isDeploying = $state(false);
    let deployStatus = $state("Deploy Distributions");

    // Derived totals
    const totalDistributions = $derived(wizardStore.distributions.length);
    const totalTokens = $derived(
        wizardStore.distributions.reduce(
            (sum, d) => sum + parseFloat(d.amount),
            0,
        ),
    );
    const totalRecipients = $derived(
        wizardStore.distributions.reduce(
            (sum, d) => sum + d.recipients.length,
            0,
        ),
    );

    async function handleDeploy() {
        if (totalDistributions === 0) return;

        isDeploying = true;
        deployStatus = "Initializing...";

        try {
            // Mock Deployment Flow
            // In a real scenario, this would loop through distributions and deploy contracts or create a Merkle root for each.
            for (let i = 0; i < totalDistributions; i++) {
                deployStatus = `Deploying ${i + 1}/${totalDistributions}...`;
                await new Promise((r) => setTimeout(r, 800)); // Simulating network
            }

            deployStatus = "Finalizing...";
            await new Promise((r) => setTimeout(r, 600));

            // Set mock success result for now
            wizardStore.setDeploymentResult(
                "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
                "0xabcdef1234567890abcdef1234567890abcdef12",
            );

            wizardStore.nextStep();
            goto("/wizard/step-3");
        } catch (e) {
            deployStatus = "Deployment Failed";
            isDeploying = false;
        }
    }

    function handleBack() {
        wizardStore.previousStep();
        goto("/wizard/step-1");
    }
</script>

<div class="h-full flex flex-col max-w-5xl mx-auto py-4">
    <div class="flex items-center justify-between mb-8">
        <div>
            <h2 class="text-3xl font-bold tracking-tight">Review Basket</h2>
            <p class="text-base-content/60 mt-1">
                You are about to deploy <strong>{totalDistributions}</strong>
                distribution{totalDistributions !== 1 ? "s" : ""}.
            </p>
        </div>
        <div class="stats bg-base-100 shadow-sm border border-base-content/10">
            <div class="stat px-4 py-2">
                <div class="stat-title text-xs">Total Tokens</div>
                <div class="stat-value text-lg font-mono text-primary">
                    {totalTokens.toLocaleString()}
                </div>
            </div>
            <div class="stat px-4 py-2">
                <div class="stat-title text-xs">Recipients</div>
                <div class="stat-value text-lg font-mono">
                    {totalRecipients}
                </div>
            </div>
        </div>
    </div>

    <!-- Basket List -->
    <div class="flex-1 overflow-y-auto space-y-4 mb-8 pr-2">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Token Info Card -->
            <div
                class="card bg-base-200/50 border border-base-content/5 shadow-sm"
            >
                <div class="card-body p-5">
                    <h3
                        class="text-xs font-bold uppercase tracking-wider opacity-50 mb-2 flex items-center gap-2"
                    >
                        <Wallet class="w-4 h-4" /> Token
                    </h3>
                    <div class="flex items-center gap-3">
                        {#if wizardStore.tokenDetails.iconUrl}
                            <img
                                src={wizardStore.tokenDetails.iconUrl}
                                alt="Token"
                                class="w-10 h-10 rounded-full"
                            />
                        {:else}
                            <div
                                class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold"
                            >
                                {wizardStore.tokenDetails.tokenSymbol?.slice(
                                    0,
                                    1,
                                )}
                            </div>
                        {/if}
                        <div>
                            <div class="font-bold">
                                {wizardStore.tokenDetails.tokenName}
                            </div>
                            <div class="text-xs opacity-60 font-mono">
                                {wizardStore.tokenDetails.tokenAddress?.slice(
                                    0,
                                    6,
                                )}...{wizardStore.tokenDetails.tokenAddress?.slice(
                                    -4,
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Distribution Cards -->
            {#each wizardStore.distributions as dist}
                <div
                    class="card bg-base-100 border border-base-content/10 shadow-sm"
                >
                    <div class="card-body p-5">
                        <div class="flex justify-between items-start mb-2">
                            <h3
                                class="font-bold text-lg truncate pr-2"
                                title={dist.name}
                            >
                                {dist.name}
                            </h3>
                            <div class="badge badge-sm badge-neutral">
                                {dist.schedule.distributionDurationMonths}m
                            </div>
                        </div>
                        <p
                            class="text-xs text-base-content/60 line-clamp-2 h-8 leading-4 mb-4"
                        >
                            {dist.description || "No description provided."}
                        </p>

                        <div
                            class="flex flex-col gap-2 text-xs opacity-80 mt-auto"
                        >
                            <div class="flex justify-between">
                                <span class="flex items-center gap-1"
                                    ><Calendar class="w-3 h-3" /> Cliff</span
                                >
                                <span class="font-mono"
                                    >{dist.schedule.cliffEndDate}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span class="flex items-center gap-1"
                                    ><Users class="w-3 h-3" /> Recipients</span
                                >
                                <span class="font-mono"
                                    >{dist.recipients.length}</span
                                >
                            </div>
                            <div class="divider my-1 opacity-50"></div>
                            <div class="flex justify-between font-bold">
                                <span>Total</span>
                                <span class="font-mono text-primary"
                                    >{parseFloat(
                                        dist.amount,
                                    ).toLocaleString()}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <!-- Warnings -->
    <div
        role="alert"
        class="alert bg-warning/5 border-warning/20 text-sm mb-6 max-w-3xl mx-auto"
    >
        <Check class="w-5 h-5 text-warning" />
        <span
            >You are deploying {totalDistributions} separate vesting contracts. This
            action is irreversible.</span
        >
    </div>

    <!-- Actions -->
    <div
        class="flex justify-between items-center pt-6 border-t border-base-content/10"
    >
        <button class="btn btn-ghost" onclick={handleBack}>
            Back to Builder
        </button>

        <button
            class="btn btn-primary btn-lg min-w-[240px]"
            disabled={isDeploying || totalDistributions === 0}
            onclick={handleDeploy}
        >
            {#if isDeploying}
                <Loader2 class="w-5 h-5 animate-spin mr-2" />
                {deployStatus}
            {:else}
                Deploy All ({totalDistributions})
                <ArrowRight class="w-5 h-5 ml-2" />
            {/if}
        </button>
    </div>
</div>
