<script lang="ts">
    import { onMount } from "svelte";
    import type { Address } from "viem";
    import { authStore } from "$lib/stores/authStore.svelte";
    import {
        extractTokenFromUrl,
        extractStateFromUrl,
        clearUrlFragment,
        decodeJwt,
    } from "$lib/auth/googleAuth";
    import DistributionCard from "$lib/components/claim/DistributionCard.svelte";
    import ImportContractInput from "$lib/components/claim/ImportContractInput.svelte";
    import PageHeader from "$lib/components/ui/PageHeader.svelte";

    import { page } from "$app/state";
    import { goto } from "$app/navigation";

    let { data } = $props();

    let isAuthenticating = $state(false);

    onMount(() => {
        // 1. Handle OAuth Redirect Callback
        const idToken = extractTokenFromUrl();
        if (idToken) {
            isAuthenticating = true;
            try {
                // Decode to get email for display/validation
                const { payload } = decodeJwt(idToken);

                // Store in AuthStore (Session only)
                authStore.setGmailSession({
                    email: payload.email,
                    jwt: idToken,
                    expiresAt: payload.exp,
                });

                // 2. Restore contractAddress from OAuth state
                const oauthState = extractStateFromUrl();
                if (oauthState?.address) {
                    // Preserve address in URL for the claim flow
                    const url = new URL(window.location.href);
                    url.searchParams.set("address", oauthState.address);
                    url.hash = ""; // Clear hash (token)
                    goto(url.pathname + url.search, { replaceState: true });
                } else {
                    // Just clear URL fragment for aesthetics & security
                    clearUrlFragment();
                }
            } catch (err) {
                console.error("[Claim] Auth failed:", err);
                clearUrlFragment();
            } finally {
                isAuthenticating = false;
            }
        }
    });

    import { claimStore } from "$lib/stores/claimStore.svelte";
    import ClaimStep1Identify from "$lib/components/claim/steps/ClaimStep1Identify.svelte";
    import ClaimStep2Timeline from "$lib/components/claim/steps/ClaimStep2Timeline.svelte";
    import ClaimModal from "$lib/components/claim/ClaimModal.svelte";

    // ... imports ...

    // 2. State for import flow
    // derived from URL to survive redirects/reloads
    let importedAddress = $derived(page.url.searchParams.get("address"));
    let currentStep = $derived(claimStore.currentStep);

    function handleImport(address: string) {
        const url = new URL(window.location.href);
        url.searchParams.set("address", address);
        goto(url.toString(), { replaceState: true });
    }
</script>

<div
    class="h-full flex flex-col relative max-w-5xl w-full px-4 md:px-0 transition-all duration-300"
>
    <PageHeader
        title="Claim Portal"
        description="Select a distribution from the vault to verify your eligibility and claim tokens."
    >
        {#snippet extra()}
            {#if importedAddress}
                <div
                    class="badge badge-accent badge-outline font-mono opacity-80 gap-1 pl-1 pr-2"
                >
                    <span class="w-2 h-2 rounded-full bg-accent animate-pulse"
                    ></span>
                    {importedAddress.slice(0, 6)}...{importedAddress.slice(-4)}
                </div>
            {/if}
        {/snippet}
    </PageHeader>

    <div class="flex-1 space-y-8 animate-in fade-in zoom-in duration-300">
        {#if !importedAddress}
            <!-- 1. Import Step (Gate) -->
            <section class="w-full">
                <ImportContractInput
                    onImport={handleImport}
                    vaultAddresses={data.vaultAddresses as Address[]}
                />
            </section>
        {:else}
            <!-- 2. Main Claim Flow -->
            <div class="w-full">
                {#if currentStep === 1}
                    <ClaimStep1Identify contractAddress={importedAddress} />
                {:else}
                    <!-- Keep Dashboard Always Visible once unlocked -->
                    <ClaimStep2Timeline />

                    <!-- Claim process happens in a Modal -->
                    <ClaimModal contractAddress={importedAddress} />
                {/if}
            </div>

            <div class="text-center mt-8">
                <button
                    class="btn btn-xs btn-ghost opacity-30 hover:opacity-100"
                    onclick={() => {
                        // Debug Reset
                        claimStore.reset();
                        goto("/claim");
                    }}
                >
                    Reset Flow
                </button>
            </div>
        {/if}
    </div>
</div>
