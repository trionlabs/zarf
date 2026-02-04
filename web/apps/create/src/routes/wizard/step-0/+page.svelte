<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
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
    import { fade, fly } from "svelte/transition";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";

    // --- State ---
    let mounted = $state(false);
    let tokenAddress = $state("");
    let tokenMetadata = $state<TokenMetadata | null>(null);
    let isFetching = $state(false);
    let error = $state<string | null>(null);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    onMount(() => {
        wizardStore.goToStep(0);

        // Initialize from store after hydration
        if (wizardStore.tokenDetails.tokenAddress) {
            tokenAddress = wizardStore.tokenDetails.tokenAddress;
        }

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

        mounted = true;

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });

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

<div
    class="min-h-[50vh] flex flex-col items-center justify-center p-4 relative overflow-hidden"
>
    <!-- Background Decor -->
    <div
        class="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-zen-fg/5 rounded-full blur-[120px] pointer-events-none"
    ></div>

    <div class="w-full max-w-2xl text-center space-y-10">
        <!-- Input Section -->
        <div class="relative group">
            <input
                type="text"
                placeholder="Paste Token Contract..."
                class="w-full bg-transparent border-none !text-4xl !md:text-5xl font-light text-center placeholder:text-zen-fg-faint text-zen-fg focus:outline-none focus:ring-0 transition-all duration-300"
                bind:value={tokenAddress}
                oninput={handleAddressInput}
                spellcheck="false"
            />

            <!-- Paste Button (Visible when empty) -->
            {#if !tokenAddress}
                <div
                    class="absolute top-1/2 -translate-y-1/2 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <ZenButton variant="ghost" size="sm" onclick={handlePaste}>
                        Paste <Clipboard class="w-3 h-3 ml-1" />
                    </ZenButton>
                </div>
            {/if}

            <!-- Error Message -->
            {#if error}
                <div
                    class="mt-4 text-zen-error text-sm font-medium flex items-center justify-center gap-2 animate-zen-slide-up"
                >
                    <AlertCircle class="w-4 h-4" />
                    {error}
                </div>
            {/if}
        </div>

        <!-- Status / Result -->
        <div class="h-32 flex items-center justify-center">
            {#if isFetching}
                <div
                    class="flex flex-col items-center gap-3 text-zen-fg-faint"
                    in:fade
                >
                    <Loader2
                        class="w-6 h-6 animate-spin text-zen-fg"
                    />
                    <span class="text-sm tracking-widest uppercase text-[10px]"
                        >Analyzing Chain</span
                    >
                </div>
            {:else if tokenMetadata}
                <!-- Token Card (Minimal) -->
                <div
                    in:fly={{ y: 10, duration: 400 }}
                    class="w-full max-w-md mx-auto"
                >
                    <ZenCard
                        interactive
                        onclick={handleNext}
                        class="flex items-center gap-5 p-4 cursor-pointer text-left"
                    >
                        <!-- Logo Box -->
                        <div class="relative shrink-0">
                            {#if tokenMetadata.logoUrl}
                                <img
                                    src={tokenMetadata.logoUrl}
                                    alt=""
                                    class="w-12 h-12 rounded-full grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
                                />
                            {:else}
                                <div
                                    class="w-12 h-12 rounded-full bg-zen-fg/5 flex items-center justify-center text-zen-fg-faint font-mono font-bold text-lg border-[0.5px] border-zen-border-subtle"
                                >
                                    {tokenMetadata.symbol?.charAt(0)}
                                </div>
                            {/if}
                        </div>

                        <!-- Details -->
                        <div class="flex-1 min-w-0">
                            <div
                                class="flex items-baseline justify-between mb-1"
                            >
                                <h3
                                    class="text-lg font-medium text-zen-fg truncate pr-4"
                                >
                                    {tokenMetadata.name}
                                </h3>
                                <span
                                    class="text-[10px] uppercase tracking-widest text-zen-fg-faint"
                                    >Verified</span
                                >
                            </div>

                            <div class="flex items-center gap-3">
                                <span
                                    class="font-mono text-xs text-zen-fg-muted px-1.5 py-0.5 bg-zen-fg/5 rounded-md"
                                >
                                    {tokenMetadata.symbol}
                                </span>
                                <span
                                    class="text-xs text-zen-fg-faint truncate font-mono"
                                >
                                    {tokenAddress.slice(
                                        0,
                                        6,
                                    )}...{tokenAddress.slice(-4)}
                                </span>
                            </div>
                        </div>

                        <!-- Subtle Arrow -->
                        <div
                            class="text-zen-fg-faint group-hover:text-zen-fg-muted transition-colors pl-2"
                        >
                            <ArrowRight class="w-4 h-4" />
                        </div>
                    </ZenCard>
                </div>
            {:else if !tokenAddress}
                <p class="text-zen-fg-faint text-sm font-light">
                    Supports Sepolia Testnet
                </p>
            {/if}
        </div>
    </div>
</div>
