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
    let importedAddress = $state<string | null>(null);

    function handleImport(address: string) {
        importedAddress = address;
    }
</script>

<div
    class="min-h-screen bg-base-200 flex flex-col items-center justify-center p-4"
>
    <div class="max-w-md w-full space-y-8">
        <!-- Logo / Header -->
        <div class="text-center">
            <h1 class="text-4xl font-bold tracking-tight">Zarf Claim</h1>
            <p class="mt-2 text-base-content/60">
                Private vesting claims via ZK Proofs.
            </p>
        </div>

        {#if !importedAddress}
            <!-- 1. Import Step -->
            <ImportContractInput onImport={handleImport} />
        {:else}
            <!-- 2. Gate Step (Blurred until Auth) -->
            <DistributionCard
                contractAddress={importedAddress}
                isAuthenticated={authStore.gmail.isAuthenticated}
            />
        {/if}
    </div>
</div>
