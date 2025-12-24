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
        Search,
    } from "lucide-svelte";
    import {
        fetchTokenMetadata,
        isValidAddress,
        type TokenMetadata,
    } from "$lib/services/tokenMetadata";

    onMount(() => {
        wizardStore.goToStep(0);
        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });

    // --- State ---
    let tokenAddress = $state(wizardStore.tokenDetails.tokenAddress || "");
    let tokenMetadata = $state<TokenMetadata | null>(null);
    let isFetching = $state(false);
    let error = $state<string | null>(null);

    // Auto-fill metadata if already in store
    if (
        wizardStore.tokenDetails.tokenAddress &&
        wizardStore.tokenDetails.tokenName
    ) {
        tokenMetadata = {
            name: wizardStore.tokenDetails.tokenName,
            symbol: wizardStore.tokenDetails.tokenSymbol || "",
            decimals: wizardStore.tokenDetails.tokenDecimals || 18,
            totalSupply: wizardStore.tokenDetails.tokenTotalSupply || "0",
            logoUrl: wizardStore.tokenDetails.iconUrl,
        };
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // --- Derived ---
    const isAddressValid = $derived(isValidAddress(tokenAddress));
    const canProceed = $derived(
        isAddressValid && tokenMetadata !== null && !isFetching,
    );

    // --- Actions ---
    async function handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            if (isValidAddress(text)) {
                tokenAddress = text;
                handleAddressInput();
            } else {
                error = "Invalid address in clipboard";
            }
        } catch {
            error = "Could not access clipboard";
        }
    }

    function handleAddressInput() {
        if (debounceTimer) clearTimeout(debounceTimer);
        error = null;
        tokenMetadata = null;

        if (!isValidAddress(tokenAddress)) {
            if (tokenAddress.length > 0 && !tokenAddress.startsWith("0x")) {
                error = "Address must start with 0x";
            }
            return;
        }

        debounceTimer = setTimeout(fetchMetadata, 500);
    }

    async function fetchMetadata() {
        if (!isAddressValid) return;

        isFetching = true;
        error = null;

        try {
            const result = await fetchTokenMetadata(
                tokenAddress as `0x${string}`,
                "sepolia",
            );

            if (result.success && result.data) {
                tokenMetadata = result.data;
                // Sync to store immediately
                wizardStore.setTokenDetails({
                    tokenAddress: tokenAddress as `0x${string}`,
                    tokenName: tokenMetadata.name,
                    tokenSymbol: tokenMetadata.symbol,
                    tokenDecimals: tokenMetadata.decimals,
                    tokenTotalSupply: tokenMetadata.totalSupply,
                    iconUrl: tokenMetadata.logoUrl,
                });
            } else {
                error = result.error || "Could not fetch token metadata";
            }
        } catch (e) {
            error = "Network error while fetching metadata";
        } finally {
            isFetching = false;
        }
    }

    function handleNext() {
        wizardStore.nextStep();
        goto("/wizard/step-1");
    }
</script>

<article
    class="h-full flex flex-col relative max-w-5xl w-full px-4 md:px-0 transition-all duration-300"
>
    <!-- Header -->
    <header class="mb-10 text-left">
        <h1 class="text-3xl font-light tracking-tight mb-3 text-base-content">
            Token Details
        </h1>
        <p class="text-base text-base-content/50 font-light leading-relaxed">
            Enter the contract address for the token you want to distribute.
        </p>
    </header>

    <section class="flex-1 space-y-8">
        <!-- Token Address Input (No Card Wrapper) -->
        <div class="space-y-6">
            <div class="form-control w-full space-y-2">
                <label class="label pl-1" for="token-address">
                    <span class="label-text font-medium text-base-content/80"
                        >Contract Information</span
                    >
                </label>

                <div
                    class="join w-full shadow-sm hover:shadow-md transition-shadow duration-300"
                >
                    <div
                        class="join-item bg-base-200/30 flex items-center px-4 border border-base-content/10 border-r-0"
                    >
                        <Search class="w-4 h-4 text-base-content/40" />
                    </div>
                    <input
                        id="token-address"
                        type="text"
                        placeholder="0x..."
                        class="input input-lg input-bordered join-item w-full font-mono text-base bg-base-100 focus:bg-base-100 border-base-content/10 focus:border-primary/50 text-base-content/80 placeholder:text-base-content/20 transition-all duration-300"
                        class:input-error={error !== null}
                        bind:value={tokenAddress}
                        oninput={handleAddressInput}
                    />
                    <button
                        class="btn btn-lg btn-square join-item border-base-content/10 hover:border-primary/30 hover:bg-primary/5 text-base-content/40 hover:text-primary transition-all duration-300"
                        onclick={handlePaste}
                        title="Paste from clipboard"
                    >
                        <Clipboard class="w-4 h-4" />
                    </button>
                </div>

                {#if error}
                    <div class="label pb-0 pl-1 animate-in slide-in-from-top-1">
                        <span
                            class="label-text-alt text-error flex items-center gap-1.5 font-medium"
                        >
                            <AlertCircle class="w-3.5 h-3.5" />
                            {error}
                        </span>
                    </div>
                {:else}
                    <div class="label pb-0 pl-1">
                        <span
                            class="label-text-alt text-base-content/40 font-light"
                        >
                            Paste your token's contract address to verify
                            ownership.
                        </span>
                    </div>
                {/if}
            </div>

            <!-- Token Metadata Preview -->
            {#if isFetching}
                <div
                    class="mt-4 p-4 rounded-xl bg-base-200/30 flex items-center justify-center gap-3 animate-pulse border border-base-content/5"
                >
                    <Loader2 class="w-5 h-5 animate-spin text-primary/60" />
                    <span class="text-sm font-light text-base-content/50"
                        >Verifying on-chain data...</span
                    >
                </div>
            {:else if tokenMetadata}
                <div
                    class="mt-4 p-5 rounded-xl bg-base-200/20 border border-base-content/5 animate-in fade-in slide-in-from-bottom-2"
                >
                    <div class="flex items-center gap-5">
                        {#if tokenMetadata.logoUrl}
                            <img
                                src={tokenMetadata.logoUrl}
                                alt={tokenMetadata.name || "Token"}
                                class="w-14 h-14 rounded-full shadow-sm ring-1 ring-base-content/5"
                            />
                        {:else}
                            <div
                                class="w-14 h-14 rounded-full bg-primary/5 flex items-center justify-center text-primary font-bold shadow-inner ring-1 ring-base-content/5"
                            >
                                {tokenMetadata.symbol?.charAt(0) || "?"}
                            </div>
                        {/if}

                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-3 flex-wrap">
                                <h3
                                    class="font-bold text-lg text-base-content tracking-tight"
                                >
                                    {tokenMetadata.name || "Unknown Token"}
                                </h3>
                                <span
                                    class="badge badge-neutral font-mono text-xs opacity-80"
                                >
                                    {tokenMetadata.symbol || "???"}
                                </span>
                                <div
                                    class="flex items-center gap-1 text-success text-xs font-medium px-2 py-0.5 bg-success/10 rounded-full"
                                >
                                    <CheckCircle class="w-3 h-3" />
                                    Verified
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-1.5">
                                <div
                                    class="text-xs uppercase tracking-wider font-bold opacity-30"
                                >
                                    Total Supply
                                </div>
                                <div
                                    class="font-mono text-sm text-base-content/70"
                                >
                                    {tokenMetadata.totalSupply || "N/A"}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </section>

    <!-- Navigation Footer -->
    <footer
        class="flex items-center justify-end pt-10 mt-auto border-t border-base-content/5"
    >
        <button
            type="button"
            class="btn btn-primary px-8 rounded-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all transform active:scale-95"
            disabled={!canProceed}
            onclick={handleNext}
        >
            Start Building
            <ArrowRight class="w-4 h-4 ml-2" />
        </button>
    </footer>
</article>
