<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { X } from "lucide-svelte";
    import ClaimStep3Wallet from "./steps/ClaimStep3Wallet.svelte";
    import ClaimStep4Proof from "./steps/ClaimStep4Proof.svelte";
    import ClaimStep5Submit from "./steps/ClaimStep5Submit.svelte";

    let { contractAddress } = $props<{ contractAddress: string }>();

    // Open logic based on store step
    let isOpen = $derived(claimStore.currentStep >= 3);

    function close() {
        // Reset to dashboard step
        claimStore.state.currentStep = 2;
        claimStore.state.selectedEpochIndex = null;
    }
</script>

{#if isOpen}
    <div class="modal modal-open">
        <div
            class="modal-box max-w-xl p-0 overflow-hidden bg-base-100 border border-base-content/10 shadow-2xl relative"
        >
            <!-- Close Button -->
            <button
                class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 z-50 text-base-content/30 hover:text-base-content"
                onclick={close}
            >
                <X class="w-4 h-4" />
            </button>

            <!-- Step Progress (Optional subtle indicator) -->
            <div class="h-1 bg-base-200 w-full">
                <div
                    class="h-full bg-primary transition-all duration-500"
                    style="width: {((claimStore.currentStep - 2) / 3) * 100}%"
                ></div>
            </div>

            <div class="p-0">
                {#if claimStore.currentStep === 3}
                    <div class="p-6">
                        <ClaimStep3Wallet />
                    </div>
                {:else if claimStore.currentStep === 4}
                    <div class="p-6 text-center">
                        <ClaimStep4Proof {contractAddress} />
                    </div>
                {:else if claimStore.currentStep === 5}
                    <div class="p-6">
                        <ClaimStep5Submit {contractAddress} />
                    </div>
                {/if}
            </div>
        </div>
        <button class="modal-backdrop" onclick={close}>Close</button>
    </div>
{/if}
