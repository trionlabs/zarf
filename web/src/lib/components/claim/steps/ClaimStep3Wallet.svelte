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

<div class="space-y-8 py-8 animate-in fade-in slide-in-from-top-4 duration-500">
    <div class="max-w-xl mx-auto space-y-8">
        <!-- Minimal Header -->
        <div class="space-y-1">
            <h2 class="text-xl font-medium text-base-content tracking-tight">
                Recipient Wallet
            </h2>
            <p class="text-xs text-base-content/40 font-light italic">
                Specify the address where your tokens will be sent.
            </p>
        </div>

        <!-- Connection / Selection Area -->
        <div class="space-y-4">
            {#if isConnected && address}
                <div
                    class="group relative p-6 rounded-2xl border border-base-content/5 bg-base-200/30 hover:bg-base-200/50 transition-all"
                >
                    <div class="flex items-center justify-between mb-2">
                        <span
                            class="text-[10px] uppercase tracking-[0.2em] text-success font-bold"
                            >Connected Address</span
                        >
                        <div class="flex gap-1.5">
                            <div
                                class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                            ></div>
                        </div>
                    </div>
                    <div
                        class="font-mono text-lg text-base-content/80 break-all leading-tight"
                    >
                        {address}
                    </div>

                    <button
                        class="absolute -bottom-3 right-6 px-3 py-1 rounded-full bg-base-100 border border-base-content/10 text-[9px] uppercase tracking-widest text-base-content/40 hover:text-primary transition-colors hover:border-primary/20"
                        onclick={() => walletStore.requestConnection()}
                    >
                        Switch Account
                    </button>
                </div>
            {:else}
                <div
                    class="p-10 rounded-2xl border border-dashed border-base-content/10 bg-base-200/10 flex flex-col items-center justify-center gap-6"
                >
                    <div
                        class="w-12 h-12 rounded-full bg-base-content/5 flex items-center justify-center"
                    >
                        <Wallet class="w-5 h-5 text-base-content/20" />
                    </div>
                    <div class="text-center space-y-1">
                        <p class="text-sm text-base-content/40">
                            No wallet connected
                        </p>
                        <p
                            class="text-[10px] text-base-content/20 max-w-[200px] leading-relaxed"
                        >
                            Please connect your wallet to set as the recipient.
                        </p>
                    </div>
                    <button
                        class="btn btn-primary btn-sm px-6 h-10 uppercase tracking-widest text-[10px]"
                        onclick={() => walletStore.requestConnection()}
                    >
                        Connect Wallet
                    </button>
                </div>
            {/if}
        </div>

        <!-- Action Bar -->
        <div
            class="pt-4 border-t border-base-content/5 flex items-center justify-between"
        >
            <div class="flex items-center gap-2">
                <div
                    class="w-2 h-2 rounded-full bg-primary/20 flex items-center justify-center"
                >
                    <div class="w-1 h-1 rounded-full bg-primary"></div>
                </div>
                <span
                    class="text-[10px] uppercase tracking-widest text-base-content/40 font-medium"
                    >Ready to confirm</span
                >
            </div>

            <button
                class="btn btn-primary px-8 h-12 uppercase tracking-[0.2em] text-[10px] font-bold group"
                disabled={!isConnected}
                onclick={handleContinue}
            >
                Confirm & Proceed
                <ArrowRight
                    class="w-3.5 h-3.5 ml-2 group-hover:translate-x-1 transition-transform"
                />
            </button>
        </div>
    </div>
</div>
