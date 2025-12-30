<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { authStore } from "$lib/stores/authStore.svelte";
    import { claimStore } from "$lib/stores/claimStore.svelte";

    // Components
    import WizardLayout from "$lib/components/claim/wizard/WizardLayout.svelte";
    import Step1Upload from "$lib/components/claim/wizard/Step1Upload.svelte";
    import Step2Proof from "$lib/components/claim/wizard/Step2Proof.svelte";
    import Step3Review from "$lib/components/claim/wizard/Step3Review.svelte";

    let contractAddress = $state<string | null>(null);

    onMount(() => {
        // 1. Recover Address from URL
        contractAddress = $page.url.searchParams.get("address");

        // 2. Restore Auth Session (if refreshed)
        authStore.restoreGmailSession();

        // 3. Security Check: Must be authenticated
        if (!authStore.gmail.isAuthenticated) {
            console.warn(
                "Unauthorized access to wizard. Redirecting to claim portal.",
            );
            goto("/claim");
            return;
        }

        if (!contractAddress) {
            console.warn(
                "No contract address specified. Redirecting to claim portal.",
            );
            goto("/claim");
        }
    });
</script>

<div class="space-y-6">
    <!-- Page Header (Optional, or integrate into content) -->
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold">Secure Claim</h1>
            {#if contractAddress}
                <div class="text-xs font-mono text-base-content/40 mt-1">
                    Contract: {contractAddress}
                </div>
            {/if}
        </div>
    </div>

    <!-- Wizard Content -->
    <WizardLayout>
        {#if claimStore.step === 1}
            {#if contractAddress}
                <Step1Upload {contractAddress} />
            {/if}
        {:else if claimStore.step === 2}
            <Step2Proof />
        {:else if claimStore.step === 3}
            <Step3Review />
        {/if}
    </WizardLayout>
</div>
