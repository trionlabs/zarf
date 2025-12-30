<script lang="ts">
    import { onMount } from "svelte";
    import { authStore } from "$lib/stores/authStore.svelte";
    import {
        extractTokenFromUrl,
        clearUrlFragment,
        decodeJwt,
    } from "$lib/auth/googleAuth";
    import DistributionCard from "$lib/components/claim/DistributionCard.svelte";
    import ImportContractInput from "$lib/components/claim/ImportContractInput.svelte";
    import PageHeader from "$lib/components/ui/PageHeader.svelte";

    import { page } from "$app/state";
    import { goto } from "$app/navigation";

    let isAuthenticating = $state(false);

    onMount(() => {
        // 1. Handle Redirect Callback
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

                // Clear URL for aesthetics & security
                clearUrlFragment();
            } catch (err) {
                console.error("Auth Failed:", err);
            } finally {
                isAuthenticating = false;
            }
        }
    });

    // 2. State for import flow
    // derived from URL to survive redirects/reloads
    let importedAddress = $derived(page.url.searchParams.get("address"));

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
        description="Connect your wallet and import a distribution contract to check your eligibility."
    />

    <div class="flex-1 space-y-8 animate-in fade-in zoom-in duration-300">
        {#if !importedAddress}
            <!-- 1. Import Step -->
            <section class="max-w-2xl">
                <ImportContractInput onImport={handleImport} />
            </section>
        {:else}
            <!-- 2. Gate Step (Blurred until Auth) -->
            <DistributionCard
                contractAddress={importedAddress}
                isAuthenticated={authStore.gmail.isAuthenticated}
            />
        {/if}
    </div>
</div>
