<script lang="ts">
    import { claimStore } from '../../stores/claimStore.svelte';
    import { X } from 'lucide-svelte';
    import ClaimStep3Wallet from './steps/ClaimStep3Wallet.svelte';
    import ClaimStep4Proof from './steps/ClaimStep4Proof.svelte';
    import ClaimStep5Submit from './steps/ClaimStep5Submit.svelte';

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
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--zen-fg)]/50 backdrop-blur-sm animate-zen-fade-in"
    >
        <button
            type="button"
            class="absolute inset-0 cursor-default border-0 bg-transparent p-0"
            onclick={close}
            aria-label="Close claim modal"
        ></button>

        <div
            class="
                relative z-10 w-full max-w-xl
                bg-zen-bg
                border-[0.5px] border-zen-border-subtle
                rounded-2xl
                shadow-[0_25px_50px_-12px_oklch(from_var(--zen-fg)_l_c_h_/_0.25)]
                animate-zen-scale-in
                overflow-hidden
            "
            role="dialog"
            aria-modal="true"
            tabindex="-1"
        >
            <!-- Close Button -->
            <button
                type="button"
                class="absolute right-4 top-4 z-50 p-1.5 rounded-full text-zen-fg-subtle hover:text-zen-fg hover:bg-zen-fg/5 transition-colors"
                onclick={close}
                aria-label="Close claim modal"
            >
                <X class="w-4 h-4" />
            </button>

            <!-- Step Progress (Optional subtle indicator) -->
            <div class="h-1 bg-zen-bg-elevated w-full">
                <div
                    class="h-full bg-zen-primary transition-all duration-500"
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
    </div>
{/if}
