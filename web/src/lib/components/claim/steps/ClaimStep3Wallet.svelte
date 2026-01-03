<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { Wallet, ArrowRight } from "lucide-svelte";

    let isConnected = $derived(walletStore.isConnected);
    let address = $derived(walletStore.address);

    function handleContinue() {
        if (!address) return;
        claimStore.setTargetWallet(address);
        claimStore.nextStep();
    }
</script>

<div class="space-y-6">
    <!-- Header -->
    <div class="text-center space-y-2 mb-2">
        <div
            class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4"
        >
            <Wallet class="w-6 h-6" />
        </div>
        <h2 class="card-title justify-center text-xl">Recipient Wallet</h2>
        <p class="text-sm text-base-content/60 font-light">
            Where should we send your tokens?
        </p>
    </div>

    <!-- Connection Status -->
    <div class="py-6 space-y-4">
        {#if isConnected && address}
            <div
                class="p-4 rounded-xl bg-success/10 border border-success/20 text-center"
            >
                <p
                    class="text-xs uppercase tracking-wider text-success font-bold mb-1"
                >
                    Connected Address
                </p>
                <p class="font-mono text-lg truncate px-4">{address}</p>
            </div>
            <p class="text-xs text-center text-base-content/40">
                Switch accounts in your wallet if you wish to use a different
                address.
            </p>
        {:else}
            <div
                class="p-8 rounded-xl bg-base-200/50 border border-base-content/5 text-center flex flex-col items-center justify-center gap-4"
            >
                <p class="text-sm opacity-60">No wallet connected.</p>
                <button
                    class="btn btn-primary"
                    onclick={() => walletStore.connect()}
                >
                    Connect Wallet
                </button>
            </div>
        {/if}
    </div>

    <div class="card-actions mt-4">
        <button
            class="btn btn-primary w-full btn-lg shadow-lg shadow-primary/20"
            disabled={!isConnected}
            onclick={handleContinue}
        >
            Confirm Recipient
            <ArrowRight class="w-4 h-4 ml-1" />
        </button>
    </div>
</div>
