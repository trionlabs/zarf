<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { authStore } from "$lib/stores/authStore.svelte";
    import { claimFlowStore } from "$lib/stores/claimFlowStore.svelte";

    // Components
    import ClaimSteps from "$lib/components/claim/wizard/ClaimSteps.svelte";
    import ClaimStep1Identify from "$lib/components/claim/steps/ClaimStep1Identify.svelte";
    import ClaimStep2Timeline from "$lib/components/claim/steps/ClaimStep2Timeline.svelte";
    import ClaimStep3Wallet from "$lib/components/claim/steps/ClaimStep3Wallet.svelte";
    import ClaimStep4Proof from "$lib/components/claim/steps/ClaimStep4Proof.svelte";
    import ClaimStep5Submit from "$lib/components/claim/steps/ClaimStep5Submit.svelte";

    let contractAddress = $state<string | null>(null);

    onMount(() => {
        // 1. Recover Address from URL
        contractAddress = $page.url.searchParams.get("address");

        // 2. Restore Auth Session (if refreshed)
        authStore.restoreGmailSession();

        // 3. Security Check: Must be authenticated
        // 3. Security Check: Must be authenticated (uses hydration-safe getter)
        if (!authStore.isAuthenticated) {
            if (import.meta.env.DEV)
                console.warn("Unauthorized access to wizard.");
            goto("/claim");
            return;
        }

        if (!contractAddress) {
            if (import.meta.env.DEV)
                console.warn("No contract address specified.");
            goto("/claim");
        }
    });
</script>

<div class="space-y-6">
    <!-- Page Header -->
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
    <div class="flex gap-8">
        <!-- Sidebar Steps -->
        <aside class="w-48 shrink-0">
            <ClaimSteps />
        </aside>

        <!-- Main Content -->
        <main class="flex-1">
            {#if claimFlowStore.currentStep === 1 && contractAddress}
                <ClaimStep1Identify {contractAddress} />
            {:else if claimFlowStore.currentStep === 2}
                <ClaimStep2Timeline />
            {:else if claimFlowStore.currentStep === 3}
                <ClaimStep3Wallet />
            {:else if claimFlowStore.currentStep === 4 && contractAddress}
                <ClaimStep4Proof {contractAddress} />
            {:else if claimFlowStore.currentStep === 5 && contractAddress}
                <ClaimStep5Submit {contractAddress} />
            {/if}
        </main>
    </div>
</div>
