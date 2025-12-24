<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import {
        ArrowRight,
        Clipboard,
        CheckCircle,
        Loader2,
        AlertCircle,
    } from "lucide-svelte";
    import {
        fetchTokenMetadata,
        isValidAddress,
        type TokenMetadata,
    } from "$lib/services/tokenMetadata";

    // Debounced auto-fetch on address input
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isFetching = false; // Prevent concurrent fetches

    onMount(() => {
        wizardStore.goToStep(1);
        
        // Return cleanup function (runs on component unmount)
        // This is the Svelte 5 way to handle cleanup in onMount
        return () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
        };
    });

    // --- Token Contract State ---
    let tokenAddress = $state(wizardStore.tokenDetails.tokenAddress || "");
    let tokenMetadata = $state<TokenMetadata | null>(null);
    let isFetchingMetadata = $state(false);
    let fetchError = $state<string | null>(null);
    let metadataFetched = $state(false);
    let lastFetchedAddress = $state("");

    // --- Distribution Config State ---
    let distributionAmount = $state(
        wizardStore.tokenDetails.distributionAmount,
    );
    let distributionName = $state(wizardStore.tokenDetails.distributionName);
    let distributionDescription = $state(
        wizardStore.tokenDetails.distributionDescription,
    );

    // --- Vesting Schedule State ---
    let cliffEndDate = $state(wizardStore.schedule.cliffEndDate);
    let durationMonths = $state(
        wizardStore.schedule.distributionDurationMonths || 0,
    );

    // Get min date (today)
    const today = new Date().toISOString().split("T")[0];

    // --- Validation ---
    const isAddressValid = $derived(
        tokenAddress.startsWith("0x") && tokenAddress.length === 42,
    );
    const isAmountValid = $derived(parseFloat(distributionAmount) > 0);
    const isNameValid = $derived(distributionName.length >= 3);
    const isDateValid = $derived(cliffEndDate !== "" && cliffEndDate >= today);
    const isDurationValid = $derived(
        durationMonths > 0 && durationMonths <= 48,
    );

    const canProceed = $derived(
        isAddressValid &&
            metadataFetched &&
            isAmountValid &&
            isNameValid &&
            isDateValid &&
            isDurationValid,
    );

    // --- UX State (Errors) ---
    const showAddressError = $derived(
        tokenAddress.length > 0 && !isAddressValid,
    );
    const showAmountError = $derived(
        distributionAmount.length > 0 && !isAmountValid,
    );
    const showNameError = $derived(distributionName.length > 0 && !isNameValid);
    const showDateInputError = $derived(cliffEndDate !== "" && !isDateValid);
    const showDateMessage = $derived(
        cliffEndDate !== "" && cliffEndDate < today,
    );

    // --- Paste from Clipboard ---
    async function handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            if (isValidAddress(text)) {
                tokenAddress = text as `0x${string}`;
                // Trigger the same flow as typing
                handleAddressInput();
            } else {
                fetchError = "Invalid Ethereum address in clipboard";
            }
        } catch (err) {
            fetchError = "Unable to read clipboard. Please paste manually.";
        }
    }

    // --- Fetch Token Metadata ---
    async function handleFetchMetadata() {
        if (!isAddressValid) return;
        if (tokenAddress === lastFetchedAddress && metadataFetched) return;
        if (isFetching) return; // Prevent concurrent fetches

        console.log("[Wizard] Fetching metadata for:", tokenAddress);
        isFetching = true;
        isFetchingMetadata = true;
        fetchError = null;
        tokenMetadata = null;
        metadataFetched = false;
        lastFetchedAddress = tokenAddress;

        try {
            const result = await fetchTokenMetadata(
                tokenAddress as `0x${string}`,
                "sepolia",
            );

            console.log("[Wizard] Fetch result:", result);

            if (result.success && result.data) {
                tokenMetadata = result.data;
                metadataFetched = true;
            } else {
                fetchError = result.error || "Failed to fetch token metadata";
            }
        } catch (err) {
            console.error("[Wizard] Fetch error:", err);
            fetchError = "Network error while fetching token data";
        } finally {
            isFetchingMetadata = false;
            isFetching = false;
        }
    }

    function handleAddressInput() {
        // Reset state when address changes
        if (tokenAddress !== lastFetchedAddress) {
            metadataFetched = false;
            tokenMetadata = null;
            fetchError = null;
        }

        // Clear existing timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }

        // Set new timer for auto-fetch
        if (tokenAddress.startsWith("0x") && tokenAddress.length === 42) {
            debounceTimer = setTimeout(() => {
                handleFetchMetadata();
            }, 500); // Increased debounce time to reduce duplicate calls
        }

        // Sync to store
        syncToStore();
    }


    // --- Explicit Store Sync (NOT in $effect) ---
    function syncToStore() {
        wizardStore.setTokenDetails({
            tokenAddress: isAddressValid
                ? (tokenAddress as `0x${string}`)
                : null,
            tokenName: tokenMetadata?.name ?? null,
            tokenSymbol: tokenMetadata?.symbol ?? null,
            tokenDecimals: tokenMetadata?.decimals ?? null,
            tokenTotalSupply: tokenMetadata?.totalSupply ?? null,
            iconUrl: tokenMetadata?.logoUrl ?? null,
            distributionAmount,
            distributionName,
            distributionDescription,
        });
        wizardStore.setSchedule({
            cliffEndDate,
            distributionDurationMonths: durationMonths,
        });
    }

    // Sync on any field change
    function handleFieldChange() {
        syncToStore();
    }

    function handleNext() {
        syncToStore(); // Final sync before navigation
        wizardStore.goToStep(2);
        goto("/wizard/step-2");
    }
</script>

<article class="h-full flex flex-col">
    <!-- Page Header -->
    <header class="mb-8">
        <h1 class="text-2xl font-semibold">Configuration</h1>
        <p class="text-sm text-base-content/60 mt-1">
            Enter your token contract address to get started.
        </p>
    </header>

    <section class="space-y-8 flex-1">
        <!-- Step 1: Token Contract Address -->
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Token Contract</legend>

            <div class="form-control w-full">
                <label class="label" for="contract-address">
                    <span class="label-text">Contract Address</span>
                </label>
                <div class="join w-full">
                    <input
                        id="contract-address"
                        type="text"
                        placeholder="0x..."
                        class="input input-bordered join-item flex-1 font-mono"
                        class:input-error={showAddressError}
                        bind:value={tokenAddress}
                        oninput={handleAddressInput}
                    />
                    <button
                        type="button"
                        class="btn btn-square join-item"
                        onclick={handlePaste}
                        title="Paste from clipboard"
                    >
                        <Clipboard class="w-4 h-4" />
                    </button>
                </div>
                {#if showAddressError}
                    <p class="text-error text-xs mt-1">
                        Invalid Ethereum address
                    </p>
                {/if}
            </div>

            <!-- Token Metadata Display -->
            {#if isFetchingMetadata}
                <div class="alert mt-4">
                    <Loader2 class="w-5 h-5 animate-spin" />
                    <span>Fetching token metadata...</span>
                </div>
            {:else if fetchError}
                <div class="alert alert-error mt-4">
                    <AlertCircle class="w-5 h-5" />
                    <span>{fetchError}</span>
                </div>
            {:else if tokenMetadata}
                <div class="card bg-base-200 mt-4">
                    <div class="card-body p-4">
                        <div class="flex items-center gap-4">
                            {#if tokenMetadata.logoUrl}
                                <img
                                    src={tokenMetadata.logoUrl}
                                    alt={tokenMetadata.name || "Token"}
                                    class="w-12 h-12 rounded-full"
                                />
                            {:else}
                                <div
                                    class="w-12 h-12 rounded-full bg-base-300 flex items-center justify-center"
                                >
                                    <span
                                        class="text-lg font-bold text-base-content/50"
                                    >
                                        {tokenMetadata.symbol?.charAt(0) || "?"}
                                    </span>
                                </div>
                            {/if}
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <h3 class="font-semibold">
                                        {tokenMetadata.name || "Unknown Token"}
                                    </h3>
                                    <span class="badge badge-sm"
                                        >{tokenMetadata.symbol || "???"}</span
                                    >
                                    <CheckCircle class="w-4 h-4 text-success" />
                                </div>
                                <p class="text-sm text-base-content/60">
                                    Total Supply: {tokenMetadata.totalSupply ||
                                        "N/A"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </fieldset>

        <!-- Step 2: Distribution Config (only show after metadata is fetched) -->
        {#if metadataFetched}
            <fieldset class="fieldset">
                <legend class="fieldset-legend"
                    >Distribution Configuration</legend
                >

                <!-- Distribution Amount -->
                <div class="form-control w-full">
                    <label class="label" for="distribution-amount">
                        <span class="label-text">Amount to Distribute</span>
                        <span class="label-text-alt"
                            >{tokenMetadata?.symbol || "tokens"}</span
                        >
                    </label>
                    <input
                        id="distribution-amount"
                        type="number"
                        placeholder="Enter amount"
                        class="input input-bordered w-full font-mono"
                        class:input-error={showAmountError}
                        bind:value={distributionAmount}
                        onchange={handleFieldChange}
                        min="0"
                        step="any"
                    />
                    {#if showAmountError}
                        <p class="text-error text-xs mt-1">
                            Amount must be greater than 0
                        </p>
                    {/if}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <!-- Distribution Name -->
                    <div class="form-control w-full">
                        <label class="label" for="distribution-name">
                            <span class="label-text">Distribution Name</span>
                        </label>
                        <input
                            id="distribution-name"
                            type="text"
                            placeholder="e.g., Team Allocation Q1 2025"
                            class="input input-bordered w-full"
                            class:input-error={showNameError}
                            bind:value={distributionName}
                            onchange={handleFieldChange}
                        />
                        {#if showNameError}
                            <p class="text-error text-xs mt-1">
                                Name must be at least 3 characters
                            </p>
                        {/if}
                    </div>

                    <!-- Distribution Description -->
                    <div class="form-control w-full">
                        <label class="label" for="distribution-description">
                            <span class="label-text">Description</span>
                            <span class="label-text-alt">Optional</span>
                        </label>
                        <input
                            id="distribution-description"
                            type="text"
                            placeholder="Brief description of this distribution"
                            class="input input-bordered w-full"
                            bind:value={distributionDescription}
                            onchange={handleFieldChange}
                        />
                    </div>
                </div>
            </fieldset>

            <!-- Step 3: Vesting Schedule -->
            <fieldset class="fieldset">
                <legend class="fieldset-legend">Vesting Schedule</legend>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Cliff Date -->
                    <div class="form-control w-full">
                        <label class="label" for="cliff-date">
                            <span class="label-text">Cliff Date</span>
                        </label>
                        <input
                            id="cliff-date"
                            type="date"
                            class="input input-bordered w-full"
                            class:input-error={showDateInputError}
                            min={today}
                            bind:value={cliffEndDate}
                            onchange={handleFieldChange}
                        />
                        {#if showDateMessage}
                            <p class="text-error text-xs mt-1">
                                Must be future date
                            </p>
                        {/if}
                    </div>

                    <!-- Duration -->
                    <div class="form-control w-full">
                        <label class="label" for="vesting-duration">
                            <span class="label-text">Vesting Duration</span>
                        </label>
                        <select
                            id="vesting-duration"
                            class="select select-bordered w-full"
                            bind:value={durationMonths}
                            onchange={handleFieldChange}
                        >
                            <option value={0} disabled>Select duration</option>
                            <option value={1}>1 month</option>
                            <option value={3}>3 months</option>
                            <option value={6}>6 months</option>
                            <option value={12}>12 months (1 year)</option>
                            <option value={24}>24 months (2 years)</option>
                            <option value={36}>36 months (3 years)</option>
                            <option value={48}>48 months (4 years)</option>
                        </select>
                    </div>
                </div>
            </fieldset>
        {/if}
    </section>

    <!-- Navigation Footer -->
    <footer
        class="flex items-center justify-between pt-8 mt-auto border-t border-base-200"
    >
        <div class="text-sm text-base-content/50 hidden md:block">
            Step 1 of 4
        </div>
        <button
            type="button"
            class="btn btn-primary"
            disabled={!canProceed}
            onclick={handleNext}
        >
            Continue
            <ArrowRight class="w-4 h-4 ml-1" />
        </button>
    </footer>
</article>
