<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { submitClaim, getExplorerUrl } from "$lib/contracts/contracts";
    import {
        Send,
        FileText,
        CheckCircle2,
        AlertTriangle,
        ExternalLink,
    } from "lucide-svelte";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import type { Address } from "viem";

    let { contractAddress } = $props<{ contractAddress: string }>();

    let isSubmitting = $state(false);
    let error = $state<string | null>(null);
    let success = $state(false);
    let txHash = $state<string | null>(null);

    // Derived Logic form Store
    let proof = $derived(claimStore.proof);

    // Fix: Show amount for the SPECIFIC epoch being claimed, not the total allocation
    let allocation = $derived(
        claimStore.selectedEpoch ? claimStore.selectedEpoch.amount : 0n,
    );

    async function handleSubmit() {
        if (!proof || !walletStore.address) return;

        isSubmitting = true;
        error = null;

        try {
            const rawInputs = proof.publicValues;

            const result = await submitClaim(
                proof.proof,
                rawInputs,
                walletStore.address as Address,
                contractAddress as Address,
            );

            claimStore.setTxHash(result.hash);
            txHash = result.hash;
            success = true;
        } catch (e: any) {
            console.error("Submission failed:", e);
            error = e.message || "Transaction failed";
        } finally {
            isSubmitting = false;
        }
    }

    function handleFinish() {
        // Return to Dashboard step and close modal
        claimStore.state.currentStep = 2;
        claimStore.state.selectedEpochIndex = null;
    }
</script>

<div class="space-y-6 text-center">
    <!-- Header -->
    <div
        class="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2"
    >
        <FileText class="w-8 h-8" />
    </div>
    <h2 class="card-title justify-center text-xl">Submit Claim</h2>
    <p class="text-sm text-base-content/60 font-light">
        Your proof is ready. Submit it to the blockchain to receive your tokens.
    </p>

    <!-- Summary -->
    <div class="stats shadow bg-base-200/50 mt-4 mx-auto">
        <div class="stat place-items-center">
            <div class="stat-title">Claiming</div>
            <div class="stat-value text-primary text-2xl">
                {(Number(allocation) / 1e18).toLocaleString()}
            </div>
            <div class="stat-desc">AZTC</div>
        </div>
    </div>

    <!-- Action -->
    {#if error}
        <div class="alert alert-error text-xs py-2 rounded-lg text-left">
            <AlertTriangle class="w-4 h-4" />
            <span>{error}</span>
        </div>
    {/if}

    {#if success}
        <div class="alert alert-success text-xs py-2 rounded-lg">
            <CheckCircle2 class="w-4 h-4" />
            <span>Transaction Submitted!</span>
        </div>

        <div class="flex flex-col gap-2 mt-4">
            {#if txHash}
                <a
                    href={getExplorerUrl(txHash as `0x${string}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-outline btn-sm gap-2"
                >
                    View on Etherscan
                    <ExternalLink class="w-3 h-3" />
                </a>
            {/if}

            <button
                class="btn btn-primary btn-md w-full mt-4"
                onclick={handleFinish}
            >
                Done & Return to Dashboard
            </button>
        </div>
    {:else}
        <div class="pt-4">
            <button
                class="btn btn-primary w-full btn-lg shadow-lg shadow-primary/20"
                disabled={isSubmitting}
                onclick={handleSubmit}
            >
                {#if isSubmitting}
                    <span class="loading loading-spinner"></span>
                    Submitting...
                {:else}
                    <div class="flex items-center gap-2">
                        Submit Transaction
                        <Send class="w-4 h-4" />
                    </div>
                {/if}
            </button>
        </div>
    {/if}
</div>
