<script lang="ts">
    import { wizardStore } from '$lib/stores/wizardStore.svelte';
    import { goto } from '$app/navigation';
    import { onMount, tick } from 'svelte';
    import { ArrowRight, Clipboard, Loader2, AlertCircle } from 'lucide-svelte';
    import { fetchTokenMetadata, type TokenMetadata } from '$lib/services/tokenMetadata';
    import { isValidContractAddressShape as isValidContractAddress } from '@zarf/core/utils/addressShape';
    import { fade, fly } from 'svelte/transition';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { getTokenPresets, type TokenPreset } from '$lib/config/tokenPresets';
    import TokenPickerModal from '$lib/components/TokenPickerModal.svelte';
    import { Search } from 'lucide-svelte';

    // --- State ---
    let tokenAddress = $state('');
    let tokenMetadata = $state<TokenMetadata | null>(null);
    let isFetching = $state(false);
    let error = $state<string | null>(null);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let selectedPreset = $state<TokenPreset | null>(null);
    let fetchSeq = 0; // monotonic request id — guards against out-of-order resolution
    let inputEl = $state<HTMLInputElement | undefined>(undefined);
    let pickerOpen = $state(false);

    // After a programmatic fill, the input auto-scrolls to the caret (end), hiding the
    // leading "C…". Reset to the start so users can verify the address prefix.
    async function revealStart() {
        await tick();
        if (inputEl) inputEl.scrollLeft = 0;
    }

    onMount(() => {
        wizardStore.goToStep(0);

        // Initialize from store after hydration
        if (wizardStore.tokenDetails.tokenAddress) {
            tokenAddress = wizardStore.tokenDetails.tokenAddress;
        }

        // Auto-fill metadata if already in store
        if (wizardStore.tokenDetails.tokenAddress && wizardStore.tokenDetails.tokenName) {
            tokenMetadata = {
                name: wizardStore.tokenDetails.tokenName,
                symbol: wizardStore.tokenDetails.tokenSymbol || '',
                decimals: wizardStore.tokenDetails.tokenDecimals || 18,
                totalSupply: wizardStore.tokenDetails.tokenTotalSupply || '0',
                logoUrl: wizardStore.tokenDetails.iconUrl,
            };
        }

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });

    // --- Derived ---
    const isAddressValid = $derived(isValidContractAddress(tokenAddress));

    // Presets react to network switches: networkStore.activeId is $state-backed,
    // unlike getActiveStellarNetworkId() which reads a non-reactive module var.
    const presets = $derived.by(() => {
        try {
            return getTokenPresets(networkStore.activeId);
        } catch {
            return [];
        }
    });

    // --- Actions ---
    function resetLookup() {
        if (debounceTimer) clearTimeout(debounceTimer);
        error = null;
        tokenMetadata = null;
        isFetching = false; // a superseded in-flight fetch won't clear this itself (seq mismatch)
        fetchSeq++; // invalidate any in-flight fetch
    }

    function handleAddressInput() {
        selectedPreset = null; // manual typing clears chip selection
        resetLookup();
        // No error here — the status area owns shape feedback (char count / "starts with C").
        if (!isValidContractAddress(tokenAddress)) return;
        debounceTimer = setTimeout(fetchMetadata, 500);
    }

    // Commit a chosen address (preset, paste, or picker) and look it up. presetLike
    // carries the icon/symbol so the result card can fall back to it when the chain
    // returns no logo.
    function loadToken(sacAddress: string, presetLike: TokenPreset | null) {
        selectedPreset = presetLike;
        tokenAddress = sacAddress;
        resetLookup();
        fetchMetadata();
        revealStart();
    }

    function selectPreset(preset: TokenPreset) {
        // No same-preset early return: chips hide once a token loads, so a re-click
        // only ever happens to retry after an error — which must be allowed.
        loadToken(preset.sacAddress, preset);
    }

    function handlePicked(sel: { sacAddress: string; iconUrl?: string; symbol?: string }) {
        const presetLike: TokenPreset | null = sel.symbol
            ? {
                  label: sel.symbol,
                  symbol: sel.symbol,
                  sacAddress: sel.sacAddress,
                  network: networkStore.activeId,
                  iconUrl: sel.iconUrl,
              }
            : null;
        loadToken(sel.sacAddress, presetLike);
    }

    async function handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            if (isValidContractAddress(text)) loadToken(text, null);
            else error = 'Invalid address in clipboard';
        } catch {
            error = 'Could not access clipboard';
        }
    }

    async function fetchMetadata() {
        const addr = tokenAddress; // snapshot — fetch resolves against this exact value
        if (!isValidContractAddress(addr)) return;

        const seq = ++fetchSeq;
        isFetching = true;
        error = null;

        try {
            const result = await fetchTokenMetadata(addr);
            if (seq !== fetchSeq) return; // a newer lookup superseded this one — drop it

            if (result.success && result.data) {
                tokenMetadata = result.data;
                // Sync to store immediately
                wizardStore.setTokenDetails({
                    tokenAddress: addr,
                    // Coalesce: the success gate guarantees decimals, but name/symbol/supply
                    // can still be null — downstream BigInt/render code must not see null.
                    tokenName: result.data.name ?? '',
                    tokenSymbol: result.data.symbol ?? '',
                    tokenDecimals: result.data.decimals ?? 18,
                    tokenTotalSupply: result.data.totalSupply ?? '0',
                    iconUrl: result.data.logoUrl,
                });
            } else {
                error = result.error || 'Could not fetch token metadata';
            }
        } catch {
            if (seq === fetchSeq) error = 'Network error while fetching metadata';
        } finally {
            if (seq === fetchSeq) isFetching = false;
        }
    }

    function handleNext() {
        wizardStore.nextStep();
        goto('/wizard/step-1');
    }
</script>

<svelte:head>
    <title>Token Details — Create Distribution — Zarf</title>
    <meta
        name="description"
        content="Step 1 of 3: enter the Stellar token contract for your distribution."
    />
</svelte:head>

<h1 class="sr-only">Create Distribution — Step 1: Token Details</h1>

<div class="min-h-[50vh] flex flex-col items-center justify-center p-4 relative overflow-hidden">
    <!-- Background Decor -->
    <div
        class="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-zen-fg/5 rounded-full blur-[120px] pointer-events-none"
    ></div>

    <div class="w-full max-w-2xl text-center space-y-10">
        <!-- Input Section -->
        <div class="relative group">
            <input
                type="text"
                placeholder="Token contract ID…"
                class="w-full bg-transparent border-none font-light font-mono placeholder:font-sans placeholder:text-zen-fg-faint text-zen-fg focus:outline-none focus:ring-0 transition-all duration-300 {tokenAddress
                    ? 'text-left text-base sm:text-lg'
                    : 'text-center text-2xl sm:text-3xl md:text-4xl px-12'}"
                bind:this={inputEl}
                bind:value={tokenAddress}
                oninput={handleAddressInput}
                spellcheck="false"
                autocomplete="off"
                autocapitalize="none"
            />

            <!-- Paste Button (Visible when empty) -->
            {#if !tokenAddress}
                <div
                    class="absolute top-1/2 -translate-y-1/2 right-0 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                >
                    <ZenButton
                        variant="ghost"
                        size="sm"
                        onclick={handlePaste}
                        aria-label="Paste contract from clipboard"
                    >
                        <Clipboard class="w-4 h-4" />
                    </ZenButton>
                </div>
            {/if}

            <!-- Error Message -->
            {#if error}
                <div
                    role="alert"
                    class="mt-4 text-zen-error text-sm font-medium flex items-center justify-center gap-2 animate-zen-slide-up"
                >
                    <AlertCircle class="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                    {#if isAddressValid}
                        <button
                            type="button"
                            onclick={fetchMetadata}
                            class="underline underline-offset-2 hover:text-zen-fg transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary"
                        >
                            Retry
                        </button>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Quick-Launch Presets + token picker trigger -->
        {#if !tokenMetadata}
            <div class="flex flex-wrap items-center justify-center gap-2">
                {#if presets.length > 0}
                    <div
                        class="flex flex-wrap items-center justify-center gap-2"
                        role="group"
                        aria-label="Quick launch tokens"
                    >
                        <span class="text-xs text-zen-fg-faint mr-1">Quick launch:</span>
                        {#each presets as preset (preset.sacAddress)}
                            {@const active = selectedPreset?.sacAddress === preset.sacAddress}
                            <button
                                type="button"
                                onclick={() => selectPreset(preset)}
                                aria-pressed={active}
                                aria-label={`Use ${preset.label}`}
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zen-bg {active
                                    ? 'border-zen-fg bg-zen-fg text-zen-bg font-medium'
                                    : 'border-zen-border-subtle bg-zen-fg/5 text-zen-fg-muted hover:border-zen-fg/20 hover:text-zen-fg hover:bg-zen-fg/10'}"
                            >
                                {#if preset.iconUrl}
                                    <img src={preset.iconUrl} alt="" class="w-4 h-4 rounded-full" />
                                {/if}
                                {preset.label}
                            </button>
                        {/each}
                    </div>
                {/if}
                <button
                    type="button"
                    onclick={() => (pickerOpen = true)}
                    aria-haspopup="dialog"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-dashed border-zen-border-subtle bg-transparent text-zen-fg-muted transition-all duration-200 hover:border-zen-fg/30 hover:text-zen-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zen-bg"
                >
                    <Search class="w-3.5 h-3.5" />
                    Search tokens
                </button>
            </div>
        {/if}

        <!-- Status / Result -->
        <div class="h-32 flex items-center justify-center">
            {#if isFetching}
                <div class="flex flex-col items-center gap-3 text-zen-fg-faint" in:fade>
                    <Loader2 class="w-6 h-6 animate-spin text-zen-fg" />
                    <span class="text-sm tracking-widest uppercase text-[10px]"
                        >Analyzing Chain</span
                    >
                </div>
            {:else if tokenMetadata}
                {@const cardLogo = tokenMetadata.logoUrl ?? selectedPreset?.iconUrl}
                <!-- Token Card (Minimal) -->
                <div in:fly={{ y: 10, duration: 400 }} class="w-full max-w-md mx-auto">
                    <ZenCard
                        interactive
                        role="button"
                        tabindex={0}
                        onclick={handleNext}
                        onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleNext();
                            }
                        }}
                        aria-label={`Continue with ${tokenMetadata.name ?? tokenMetadata.symbol ?? 'selected token'}`}
                        class="flex items-center gap-5 p-4 cursor-pointer text-left"
                    >
                        <!-- Logo Box -->
                        <div class="relative shrink-0">
                            {#if cardLogo}
                                <img
                                    src={cardLogo}
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
                            <div class="flex items-baseline justify-between mb-1">
                                <h3 class="text-lg font-medium text-zen-fg truncate pr-4">
                                    {tokenMetadata.name}
                                </h3>
                                <span
                                    class="text-[10px] uppercase tracking-widest text-zen-fg-faint"
                                    >On-chain</span
                                >
                            </div>

                            <div class="flex items-center gap-3">
                                <span
                                    class="font-mono text-xs text-zen-fg-muted px-1.5 py-0.5 bg-zen-fg/5 rounded-md"
                                >
                                    {tokenMetadata.symbol}
                                </span>
                                <span class="text-xs text-zen-fg-faint truncate font-mono">
                                    {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}
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
            {:else if tokenAddress && !isAddressValid}
                <div class="text-zen-fg-faint text-sm" aria-live="polite" in:fade>
                    {#if !tokenAddress.startsWith('C')}
                        Contract IDs start with "C"
                    {:else if tokenAddress.length < 56}
                        <span class="font-mono">{tokenAddress.length}</span>/56 characters
                    {:else}
                        Invalid contract format
                    {/if}
                </div>
            {:else if !tokenAddress}
                <p class="text-zen-fg-muted text-sm font-light">Supports Stellar</p>
            {/if}
        </div>
    </div>

    <TokenPickerModal
        open={pickerOpen}
        onclose={() => (pickerOpen = false)}
        onselect={handlePicked}
    />
</div>
