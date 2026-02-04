<script lang="ts">
    import { onMount } from "svelte";
    import type { Address } from "viem";
    import { authStore } from "@zarf/ui/stores/authStore.svelte";
    import {
        extractTokenFromUrl,
        extractStateFromUrl,
        clearUrlFragment,
        decodeJwt,
    } from "@zarf/ui/utils/googleAuth";
    import ImportContractInput from "$lib/components/claim/ImportContractInput.svelte";
    import LoginPrompt from "$lib/components/claim/LoginPrompt.svelte";
    import PageHeader from "@zarf/ui/components/ui/PageHeader.svelte";
    import ZenBadge from "@zarf/ui/components/ui/ZenBadge.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import { filterDistributionsByEmail } from "$lib/services/emailFilter";

    import { page } from "$app/state";
    import { goto } from "$app/navigation";

    let { data } = $props();

    let isAuthenticating = $state(false);
    let isFiltering = $state(false);
    let hasFiltered = $state(false);
    let filteredAddresses = $state<Address[]>([]);

    // Track if user is authenticated
    let isAuthenticated = $derived(authStore.isAuthenticated);
    let userEmail = $derived(authStore.gmail.email);

    // Filter distributions when user authenticates
    $effect(() => {
        // Reset filter state when auth changes
        if (!isAuthenticated || !userEmail) {
            hasFiltered = false;
            filteredAddresses = [];
            return;
        }

        // Filter when authenticated with email and have addresses
        if (data.vaultAddresses.length > 0) {
            filterDistributions(userEmail, data.vaultAddresses as Address[]);
        } else {
            // No addresses to filter
            hasFiltered = true;
            filteredAddresses = [];
        }
    });

    async function filterDistributions(email: string, addresses: Address[]) {
        isFiltering = true;
        hasFiltered = false;

        try {
            const eligible = await filterDistributionsByEmail(addresses, email);
            filteredAddresses = eligible;
        } catch (error) {
            console.error("[Claim] Failed to filter distributions:", error);
            // Fall back to showing all on error
            filteredAddresses = addresses;
        } finally {
            isFiltering = false;
            hasFiltered = true;
        }
    }

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

    // 2. State for import flow
    // derived from URL to survive redirects/reloads
    let importedAddress = $derived(page.url.searchParams.get("address"));
    let currentStep = $derived(claimStore.currentStep);

    function handleImport(address: string) {
        const url = new URL(window.location.href);
        url.searchParams.set("address", address);
        goto(url.toString(), { replaceState: true });
    }

    // Security & State Reset: If we change contracts or go back to list, reset the store
    let lastAddress = $state<string | null>(null);
    $effect(() => {
        if (importedAddress !== lastAddress) {
            console.log(
                "[Claim] Context Changed, Reseting Store:",
                importedAddress,
            );
            claimStore.reset();
            lastAddress = importedAddress;
        }
    });
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
                <ZenBadge variant="primary" class="font-mono gap-1 pl-1 pr-2">
                    <span class="w-2 h-2 rounded-full bg-zen-primary animate-pulse"
                    ></span>
                    {importedAddress.slice(0, 6)}...{importedAddress.slice(-4)}
                </ZenBadge>
            {/if}
        {/snippet}
    </PageHeader>

    <div class="flex-1 space-y-8 animate-in fade-in zoom-in duration-300">
        {#if !isAuthenticated}
            <!-- 0. Login Gate -->
            <section class="w-full pt-8">
                <LoginPrompt />
            </section>
        {:else if !importedAddress}
            <!-- 1. Import Step (Gate) -->
            <section class="w-full">
                <ImportContractInput
                    onImport={handleImport}
                    vaultAddresses={hasFiltered ? filteredAddresses : []}
                    isFiltering={isFiltering || !hasFiltered}
                />
            </section>
        {:else}
            <!-- 2. Main Claim Flow -->
            <div class="w-full">
                {#if currentStep === 1}
                    <ClaimStep1Identify contractAddress={importedAddress} />
                {:else}
                    <!-- Dashboard & Inline Claim Flow -->
                    <ClaimStep2Timeline contractAddress={importedAddress} />
                {/if}
            </div>

            <div class="text-center mt-8">
                <ZenButton
                    variant="ghost"
                    size="xs"
                    class="opacity-30 hover:opacity-100"
                    onclick={() => {
                        // Debug Reset
                        claimStore.reset();
                        goto("/");
                    }}
                >
                    Reset Flow
                </ZenButton>
            </div>
        {/if}
    </div>
</div>
