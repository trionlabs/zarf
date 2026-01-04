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

            // Critical: Update the store so the schedule and stats update immediately
            if (proof?.identityCommitment) {
                claimStore.markAsClaimed(proof.identityCommitment);
            }

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

<div
    class="space-y-10 py-8 animate-in fade-in slide-in-from-top-4 duration-500"
>
    <div class="max-w-xl space-y-10 text-left">
        <!-- Header Section -->
        <div class="space-y-3">
            <div
                class="w-14 h-14 rounded-full bg-primary/5 text-primary flex items-center justify-center mb-4 border border-primary/10"
            >
                <FileText class="w-6 h-6" />
            </div>
            <h2 class="text-2xl font-medium tracking-tight">Finalize Claim</h2>
            <p
                class="text-sm text-base-content/40 font-light max-w-sm leading-relaxed"
            >
                Your zero-knowledge proof is verified and ready. One final
                signature to receive your tokens.
            </p>
        </div>

        <!-- Amount Highlight -->
        <div
            class="relative py-8 px-6 rounded-[2rem] bg-base-200/30 border border-base-content/5 overflow-hidden"
        >
            <div
                class="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl"
            ></div>
            <div
                class="absolute -bottom-10 -left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl"
            ></div>

            <div class="relative space-y-1">
                <span
                    class="text-[10px] uppercase tracking-[0.3em] text-base-content/30 font-bold"
                    >Claim Amount</span
                >
                <div class="flex items-baseline justify-start gap-2">
                    <span
                        class="text-5xl font-light tracking-tighter text-base-content"
                    >
                        {(Number(allocation) / 1e18).toLocaleString()}
                    </span>
                    <span
                        class="text-sm font-medium text-primary uppercase tracking-widest"
                        >AZTC</span
                    >
                </div>
            </div>
        </div>

        <!-- Status / Errors -->
        {#if error}
            <div
                class="flex items-center gap-3 p-4 rounded-xl bg-error/5 border border-error/10 text-error text-xs text-left"
            >
                <AlertTriangle class="w-4 h-4 shrink-0" />
                <p>{error}</p>
            </div>
        {/if}

        {#if success}
            <div class="space-y-6 animate-in zoom-in duration-500">
                <div class="flex items-center justify-start gap-2 text-success">
                    <CheckCircle2 class="w-5 h-5" />
                    <span class="text-sm font-medium uppercase tracking-widest"
                        >Transaction Success</span
                    >
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {#if txHash}
                        <a
                            href={getExplorerUrl(txHash as `0x${string}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn btn-ghost border-base-content/5 bg-base-100 hover:bg-base-200/50 h-14 rounded-2xl text-[10px] uppercase tracking-widest font-bold"
                        >
                            <ExternalLink class="w-3.5 h-3.5 mr-2 opacity-40" />
                            View Explorer
                        </a>
                    {/if}

                    <button
                        class="btn btn-primary h-14 rounded-2xl text-[10px] uppercase tracking-widest font-bold shadow-sm shadow-primary/10 hover:shadow-primary/20 transition-all"
                        onclick={handleFinish}
                    >
                        Return to Vault
                    </button>
                </div>
            </div>
        {:else}
            <!-- Action Button -->
            <div class="pt-4">
                <button
                    class="btn btn-primary w-full h-16 rounded-2xl text-[11px] uppercase tracking-[0.3em] font-bold shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/20 transition-all group disabled:shadow-none disabled:bg-base-content/5 disabled:text-base-content/20"
                    disabled={isSubmitting}
                    onclick={handleSubmit}
                >
                    {#if isSubmitting}
                        <span class="loading loading-spinner loading-sm"></span>
                        <span class="ml-2">Transmitting...</span>
                    {:else}
                        <div class="flex items-center justify-center gap-3">
                            Submit to Blockchain
                            <Send
                                class="w-3.5 h-3.5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform"
                            />
                        </div>
                    {/if}
                </button>
                <p
                    class="text-[10px] text-base-content/20 mt-4 italic font-light"
                >
                    Tokens will be sent immediately after network confirmation.
                </p>
            </div>
        {/if}
    </div>
</div>
