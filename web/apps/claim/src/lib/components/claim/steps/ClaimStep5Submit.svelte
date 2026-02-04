<script lang="ts">
    import { claimStore } from "../../../stores/claimStore.svelte";
    import { submitClaim, getExplorerUrl } from "@zarf/core/contracts";
    import {
        Send,
        FileText,
        CheckCircle2,
        AlertTriangle,
        ExternalLink,
        Loader2,
    } from "lucide-svelte";
    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import type { Address } from "viem";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

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

    // Check if connected wallet matches the proof's target wallet
    let isWalletMismatch = $derived(
        walletStore.address &&
        claimStore.targetWallet &&
        walletStore.address.toLowerCase() !== claimStore.targetWallet.toLowerCase()
    );

    function handleRegenerateProof() {
        if (walletStore.address) {
            error = null;
            claimStore.clearProofForNewWallet(walletStore.address);
        }
    }

    function sanitizeError(err: any): string {
        const message = err?.message || err?.toString() || "";

        // User rejected transaction
        if (
            message.includes("rejected") ||
            message.includes("denied") ||
            message.includes("User denied")
        ) {
            return "Transaction was rejected. Please try again when ready.";
        }

        // Insufficient funds
        if (message.includes("insufficient funds")) {
            return "Insufficient funds to cover gas fees.";
        }

        // Already claimed
        if (message.includes("already claimed") || message.includes("AlreadyClaimed")) {
            return "This epoch has already been claimed.";
        }

        // Network issues
        if (message.includes("network") || message.includes("disconnected")) {
            return "Network error. Please check your connection and try again.";
        }

        // Contract revert
        if (message.includes("revert") || message.includes("execution reverted")) {
            return "Transaction failed. The contract rejected this claim.";
        }

        // Fallback - truncate if too long
        if (message.length > 100) {
            return "Transaction failed. Please try again.";
        }

        return message || "An unexpected error occurred.";
    }

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
            error = sanitizeError(e);
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

<div class="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <!-- Header Section -->
        <div class="flex items-start gap-4">
            <div
                class="w-12 h-12 rounded-full bg-zen-primary/10 text-zen-primary flex items-center justify-center shrink-0"
            >
                <FileText class="w-6 h-6" />
            </div>
            <div>
                <h2 class="text-xl font-semibold">Finalize Claim</h2>
                <p class="text-sm text-zen-fg-muted font-light mt-1">
                    Your zero-knowledge proof is verified and ready. One final
                    signature to receive your tokens.
                </p>
            </div>
        </div>

        <!-- Amount Highlight -->
        <div
            class="relative py-8 px-6 rounded-[2rem] bg-zen-fg/5 border border-zen-border-subtle overflow-hidden"
        >
            <div
                class="absolute -top-10 -right-10 w-32 h-32 bg-zen-primary/5 rounded-full blur-3xl"
            ></div>
            <div
                class="absolute -bottom-10 -left-10 w-32 h-32 bg-zen-primary/5 rounded-full blur-3xl"
            ></div>

            <div class="relative space-y-1">
                <span
                    class="text-[10px] uppercase tracking-[0.3em] text-zen-fg-faint font-bold"
                    >Claim Amount</span
                >
                <div class="flex items-baseline justify-start gap-2">
                    <span
                        class="text-5xl font-light tracking-tighter text-zen-fg"
                    >
                        {(Number(allocation) / 1e18).toLocaleString()}
                    </span>
                    <span
                        class="text-sm font-medium text-zen-primary uppercase tracking-widest"
                        >AZTC</span
                    >
                </div>
            </div>
        </div>

        <!-- Wallet Card -->
        <div class="p-5 rounded-2xl border {isWalletMismatch ? 'border-zen-warning/30 bg-zen-warning/5' : 'border-zen-border-subtle bg-zen-fg/5'}">
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs uppercase tracking-widest {isWalletMismatch ? 'text-zen-warning' : 'text-zen-success'} font-bold">
                    {isWalletMismatch ? 'Connected Wallet' : 'Claiming to'}
                </span>
                <span class="w-1.5 h-1.5 rounded-full {isWalletMismatch ? 'bg-zen-warning' : 'bg-zen-success'}"></span>
            </div>
            <div class="font-mono text-sm text-zen-fg-muted break-all">
                {walletStore.address}
            </div>
            <button
                class="mt-3 px-3 py-1 text-xs rounded-md border border-zen-border hover:border-zen-primary/20 hover:text-zen-primary transition-colors"
                onclick={() => walletStore.requestConnection()}
            >
                Change Wallet
            </button>
        </div>

        <!-- Wallet Mismatch Warning -->
        {#if isWalletMismatch}
            <div
                class="p-4 rounded-xl bg-zen-warning/5 border border-zen-warning/20 space-y-3"
            >
                <div class="flex items-start gap-3">
                    <AlertTriangle class="w-4 h-4 text-zen-warning shrink-0 mt-0.5" />
                    <div class="space-y-1">
                        <p class="text-sm font-medium text-zen-warning">
                            Wallet address changed
                        </p>
                        <p class="text-xs text-zen-fg-muted">
                            The proof was generated for a different wallet. You need to regenerate the proof for your current wallet.
                        </p>
                    </div>
                </div>
                <button
                    class="w-full py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl border border-zen-warning/30 text-zen-warning hover:bg-zen-warning/10 transition-colors"
                    onclick={handleRegenerateProof}
                >
                    Regenerate Proof
                </button>
            </div>
        {/if}

        <!-- Status / Errors -->
        {#if error}
            <div
                class="flex items-center gap-3 p-4 rounded-xl bg-zen-error/5 border border-zen-error/10 text-zen-error text-xs text-left"
            >
                <AlertTriangle class="w-4 h-4 shrink-0" />
                <p>{error}</p>
            </div>
        {/if}

        {#if success}
            <div class="space-y-6 animate-in zoom-in duration-500">
                <div class="flex items-center justify-start gap-2 text-zen-success">
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
                            class="flex items-center justify-center border border-zen-border-subtle bg-zen-bg hover:bg-zen-fg/5 h-14 rounded-2xl text-[10px] uppercase tracking-widest font-bold transition-colors"
                        >
                            <ExternalLink class="w-3.5 h-3.5 mr-2 opacity-40" />
                            View Explorer
                        </a>
                    {/if}

                    <ZenButton
                        variant="primary"
                        class="h-14 rounded-2xl text-[10px] uppercase tracking-widest font-bold shadow-[var(--zen-shadow-sm)] shadow-zen-primary/10 hover:shadow-zen-primary/20 transition-all"
                        onclick={handleFinish}
                    >
                        Return to Vault
                    </ZenButton>
                </div>
            </div>
        {:else}
            <!-- Action Button -->
            <div class="pt-4">
                <ZenButton
                    variant="primary"
                    class="w-full h-16 rounded-2xl text-[11px] uppercase tracking-[0.3em] font-bold shadow-[var(--zen-shadow-md)] shadow-zen-primary/10 hover:shadow-[var(--zen-shadow-lg)] hover:shadow-zen-primary/20 transition-all group"
                    disabled={isSubmitting || isWalletMismatch}
                    onclick={handleSubmit}
                >
                    {#if isSubmitting}
                        <Loader2 class="w-4 h-4 animate-spin" />
                        <span class="ml-2">Transmitting...</span>
                    {:else}
                        <div class="flex items-center justify-center gap-3">
                            Claim to this wallet
                            <Send
                                class="w-3.5 h-3.5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform"
                            />
                        </div>
                    {/if}
                </ZenButton>
                <p
                    class="text-[10px] text-zen-fg-faint mt-4 italic font-light"
                >
                    Tokens will be sent immediately after network confirmation.
                </p>
            </div>
        {/if}
</div>
