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
            ? (BigInt(claimStore.claimData.vestedAmount) / 10n ** 18n).toString() // Assume 18 decimals for display, precise metadata is better but this is MVP
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
                await new Promise(r => setTimeout(r, 1000));
            }

            const { hash } = await submitClaim(
                claimStore.proof.hex,
                claimStore.proof.publicInputs,
                walletStore.address as Address
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

<div class="card bg-base-100 shadow-xl max-w-2xl mx-auto mt-8">
    <div class="card-body">
        
        {#if successHash}
            <!-- Success State -->
            <div class="text-center space-y-4 animate-in fade-in zoom-in">
                <div class="text-success text-6xl">🎉</div>
                <h2 class="text-3xl font-bold">Claim Submitted!</h2>
                <p class="text-base-content/60">
                    Your transaction has been sent to the network.
                </p>
                <div class="bg-base-200 p-4 rounded-lg font-mono text-xs break-all">
                    {successHash}
                </div>
                <div class="flex justify-center gap-4 mt-6">
                    <a 
                        href={`https://sepolia.etherscan.io/tx/${successHash}`} 
                        target="_blank" 
                        class="btn btn-outline"
                    >
                        View on Explorer
                    </a>
                    <button class="btn btn-primary" onclick={() => goto('/claim')}>
                        Done
                    </button>
                </div>
            </div>
        {:else}
            <!-- Review State -->
            <h2 class="card-title justify-center mb-6">Review & Submit</h2>

            <div class="stats stats-vertical shadow w-full bg-base-200 mb-6">
                <div class="stat">
                    <div class="stat-title">Token Amount</div>
                    <div class="stat-value text-primary">{amountFormatted} TOKENS</div>
                    <div class="stat-desc font-mono">{amountHex}</div>
                </div>
                
                <div class="stat">
                    <div class="stat-title">Recipient Address</div>
                    <div class="stat-value text-lg font-mono break-all">{recipient}</div>
                    <div class="stat-desc">
                        {#if recipient === walletStore.address}
                            (Your Connected Wallet)
                        {:else}
                            (Custom Address)
                        {/if}
                    </div>
                </div>
            </div>

            <div class="alert alert-info shadow-sm mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <div class="text-sm">
                    <strong>Privacy Check:</strong> Your email is NOT included in this transaction. 
                    Only the ZK Proof and the Recipient address are public.
                </div>
            </div>

            <!-- Network Warning -->
            {#if isWrongNetwork}
                <div class="alert alert-warning shadow-sm mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <span>You are on the wrong network. Switch to Sepolia to claim.</span>
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