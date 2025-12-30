<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { submitClaim } from "$lib/contracts/contracts";
    import { SEPOLIA_CHAIN_ID } from "$lib/contracts/wallet";
    import { goto } from "$app/navigation";
    import type { Address } from "viem";

    // State
    let isSubmitting = $state(false);
    let error = $state<string | null>(null);
    let successHash = $state<string | null>(null);

    // Derived
    const isWrongNetwork = $derived(walletStore.chainId !== SEPOLIA_CHAIN_ID);
    const amountHex = $derived(claimStore.claimData?.vestedAmount || "0x0");
    const amountFormatted = $derived(
        claimStore.claimData
            ? (
                  BigInt(claimStore.claimData.vestedAmount) /
                  10n ** 18n
              ).toString() // Assume 18 decimals for display, precise metadata is better but this is MVP
            : "0",
    );
    const recipient = $derived(claimStore.claimData?.recipient);

    async function handleClaim() {
        if (!claimStore.proof || !claimStore.claimData) return;

        isSubmitting = true;
        error = null;

        try {
            // Check Network Again
            if (isWrongNetwork) {
                await walletStore.switchChain(SEPOLIA_CHAIN_ID);
                // Wait a moment for state to update
                await new Promise((r) => setTimeout(r, 1000));
            }

            const { hash } = await submitClaim(
                claimStore.proof.hex,
                claimStore.proof.publicInputs,
                walletStore.address as Address,
            );

            successHash = hash;
            claimStore.setTxHash(hash);
        } catch (e: any) {
            console.error(e);
            error = e.message || "Transaction failed";
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div
    class="card bg-base-100 border border-base-content/10 shadow-sm transition-all duration-200"
>
    <div class="card-body p-8">
        {#if successHash}
            <!-- Success State -->
            <div
                class="text-center space-y-6 animate-in fade-in zoom-in duration-500 py-8"
            >
                <div class="relative mx-auto w-24 h-24">
                    <div
                        class="absolute inset-0 bg-success/20 rounded-full animate-ping"
                    ></div>
                    <div
                        class="relative w-full h-full bg-success/10 rounded-full flex items-center justify-center border border-success/20"
                    >
                        <div class="text-4xl">🎉</div>
                    </div>
                </div>

                <div class="space-y-2">
                    <h2 class="text-3xl font-bold tracking-tight">
                        Claim Submitted!
                    </h2>
                    <p class="text-base-content/60 max-w-sm mx-auto">
                        Your transaction has been securely sent to the network.
                        Your tokens are on the way.
                    </p>
                </div>

                <div
                    class="bg-base-200/50 p-4 rounded-xl font-mono text-xs break-all border border-base-content/5 flex items-center gap-3 text-left"
                >
                    <div
                        class="w-8 h-8 rounded-lg bg-base-100 flex items-center justify-center shrink-0 border border-base-content/5"
                    >
                        <span class="text-xs font-bold opacity-50">TX</span>
                    </div>
                    <span class="opacity-70">{successHash}</span>
                </div>

                <div class="flex justify-center gap-4 mt-8">
                    <a
                        href={`https://sepolia.etherscan.io/tx/${successHash}`}
                        target="_blank"
                        class="btn btn-outline border-base-content/10 hover:border-base-content/30"
                    >
                        View on Explorer
                    </a>
                    <button
                        class="btn btn-primary shadow-lg shadow-primary/20"
                        onclick={() => goto("/claim")}
                    >
                        Done
                    </button>
                </div>
            </div>
        {:else}
            <!-- Review State -->
            <div class="space-y-6">
                <div class="flex items-center gap-4 mb-2">
                    <h2 class="text-xl font-bold tracking-tight flex-1">
                        Review & Submit
                    </h2>
                </div>

                <div
                    class="grid grid-cols-1 divide-y divide-base-content/5 border border-base-content/5 rounded-2xl bg-base-200/30 overflow-hidden"
                >
                    <div
                        class="p-5 flex items-center justify-between group hover:bg-base-100/50 transition-colors"
                    >
                        <div class="space-y-0.5">
                            <span
                                class="text-xs font-bold uppercase tracking-wider text-base-content/40"
                                >Amount</span
                            >
                            <div class="font-medium text-lg">
                                {amountFormatted} TOKENS
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="font-mono text-xs text-base-content/30">
                                {amountHex}
                            </div>
                        </div>
                    </div>

                    <div
                        class="p-5 flex items-center justify-between group hover:bg-base-100/50 transition-colors"
                    >
                        <div class="space-y-0.5">
                            <span
                                class="text-xs font-bold uppercase tracking-wider text-base-content/40"
                                >Recipient</span
                            >
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-sm"
                                    >{recipient?.slice(
                                        0,
                                        6,
                                    )}...{recipient?.slice(-4)}</span
                                >
                                <span
                                    class="badge badge-sm badge-neutral font-mono text-[10px] opacity-70"
                                >
                                    {recipient === walletStore.address
                                        ? "Wallet"
                                        : "Custom"}
                                </span>
                            </div>
                        </div>
                        <div
                            class="font-mono text-xs text-base-content/30 break-all max-w-[200px] text-right hidden sm:block"
                        >
                            {recipient}
                        </div>
                    </div>
                </div>
            </div>

            <div class="alert alert-info shadow-sm mb-6">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    class="stroke-current shrink-0 w-6 h-6"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path></svg
                >
                <div class="text-sm">
                    <strong>Privacy Check:</strong> Your email is NOT included in
                    this transaction. Only the ZK Proof and the Recipient address
                    are public.
                </div>
            </div>

            <!-- Network Warning -->
            {#if isWrongNetwork}
                <div class="alert alert-warning shadow-sm mb-6">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="stroke-current shrink-0 h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        /></svg
                    >
                    <span
                        >You are on the wrong network. Switch to Sepolia to
                        claim.</span
                    >
                </div>
            {/if}

            <div class="card-actions justify-center">
                <button
                    class="btn btn-primary btn-lg w-full"
                    disabled={isSubmitting}
                    onclick={handleClaim}
                >
                    {#if isSubmitting}
                        <span class="loading loading-spinner"></span>
                        Submitting...
                    {:else if isWrongNetwork}
                        Switch Network
                    {:else}
                        Submit Transaction 🚀
                    {/if}
                </button>
            </div>

            {#if error}
                <div class="alert alert-error mt-4">
                    <span>{error}</span>
                </div>
            {/if}
        {/if}
    </div>
</div>
