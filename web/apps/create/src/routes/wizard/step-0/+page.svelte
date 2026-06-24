<script lang="ts">
    import { wizardStore } from '$lib/stores/wizardStore.svelte';
    import { goto } from '$app/navigation';
    import { onMount, tick } from 'svelte';
    import {
        ArrowRight,
        ArrowLeft,
        Clipboard,
        Loader2,
        AlertCircle,
        AlertTriangle,
        Copy,
        Check,
        ExternalLink,
    } from 'lucide-svelte';
    import { getContractExplorerUrl } from '@zarf/core/contracts/explorer';
    import { warn } from '@zarf/core/utils/log';
    import Tooltip from '@zarf/ui/components/ui/Tooltip.svelte';
    import { fetchTokenMetadata, type TokenMetadata } from '$lib/services/tokenMetadata';
    import { isValidContractAddressShape as isValidContractAddress } from '@zarf/core/utils/addressShape';
    import { isChecksumValidContract } from '@zarf/core/utils/tokenAsset';
    import { fade, fly } from 'svelte/transition';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { getTokenPresets, type TokenPreset } from '$lib/config/tokenPresets';
    import { getRegistryToken } from '$lib/config/tokenRegistry';
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
    let selectedTrust = $state<'curated' | 'imported'>('curated');
    let acknowledged = $state(false);

    // Honour prefers-reduced-motion for the JS (rAF) transitions below — the global
    // CSS reduced-motion rule only neutralises CSS animations, not Svelte transitions.
    const reduceMotion =
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // After a programmatic fill, the input auto-scrolls to the caret (end), hiding the
    // leading "C…". Reset to the start so users can verify the address prefix.
    async function revealStart() {
        await tick();
        if (inputEl) inputEl.scrollLeft = 0;
    }

    onMount(() => {
        wizardStore.goToStep(0);
        const td = wizardStore.tokenDetails;

        if (td.tokenAddress) {
            tokenAddress = td.tokenAddress;
            // Derive trust from the address itself — unconditionally, before the
            // name-gated card restore below — so a restored *imported* token can't
            // fall back to the curated/"Verified" default just because its on-chain
            // metadata exposed only a symbol (empty name).
            selectedTrust = trustFor(td.tokenAddress);
            // Restore the persisted acknowledgement so a previously-confirmed import
            // returns with its box checked (and Continue enabled) instead of re-gating.
            acknowledged = !!td.acknowledged;
        }

        // Restore the card when the chain exposed a name OR symbol — matching
        // fetchTokenMetadata's own success criterion (both null = failure).
        if (td.tokenAddress && (td.tokenName || td.tokenSymbol)) {
            tokenMetadata = {
                name: td.tokenName,
                symbol: td.tokenSymbol || '',
                // Stellar SACs are 7 decimals; default to 7 (not EVM's 18), and use
                // ?? so a legitimately-stored 0 isn't clobbered by ||.
                decimals: td.tokenDecimals ?? 7,
                totalSupply: td.tokenTotalSupply || '0',
                logoUrl: td.iconUrl,
            };
        }

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            if (copyTimer) clearTimeout(copyTimer);
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
    // Curated tokens (present in the registry) are trusted; anything else is an
    // unverified import that must clear the acknowledgement gate before continuing.
    function trustFor(addr: string): 'curated' | 'imported' {
        return getRegistryToken(networkStore.activeId, addr) ? 'curated' : 'imported';
    }

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
        // Classify trust here too: typing or pasting straight into the field bypasses
        // loadToken(), so without this an unknown contract would render as "Verified"
        // and skip the import-acknowledgement gate.
        selectedTrust = trustFor(tokenAddress);
        acknowledged = false;
        // Show the lookup state immediately — otherwise the status area is blank for
        // the whole 500ms debounce before fetchMetadata flips isFetching itself.
        isFetching = true;
        debounceTimer = setTimeout(fetchMetadata, 500);
    }

    // Commit a chosen address (preset, paste, or picker) and look it up. presetLike
    // carries the icon/symbol so the result card can fall back to it when the chain
    // returns no logo.
    function loadToken(sacAddress: string, presetLike: TokenPreset | null) {
        selectedPreset = presetLike;
        tokenAddress = sacAddress;
        acknowledged = false;
        resetLookup();

        // Trust + offline identity (D4/D5): a curated token renders its identity
        // from the registry immediately — and can proceed — even if the indexer
        // is down. fetchMetadata enriches on-chain fields when it responds.
        const known = getRegistryToken(networkStore.activeId, sacAddress);
        selectedTrust = known ? 'curated' : 'imported';
        if (known) {
            tokenMetadata = {
                name: known.name,
                symbol: known.symbol,
                decimals: known.decimals,
                totalSupply: null,
                logoUrl: known.iconUrl ?? null,
            };
            wizardStore.setTokenDetails({
                tokenAddress: sacAddress,
                tokenName: known.name,
                tokenSymbol: known.symbol,
                tokenDecimals: known.decimals,
                tokenTotalSupply: '0',
                iconUrl: known.iconUrl,
                trust: 'curated',
                acknowledged: false,
            });
        }

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

        // Curated registry entries are pre-verified; for anything else, verify the
        // StrKey checksum (catches typo'd / lookalike contract ids) before the network
        // round-trip — parity with the picker's import path. Dynamic-imported, so a
        // preset/curated selection never pulls the SDK in.
        const curated = getRegistryToken(networkStore.activeId, addr);

        try {
            if (!curated && !(await isChecksumValidContract(addr))) {
                if (seq === fetchSeq && !tokenMetadata) {
                    error = 'That contract id fails its checksum — check for a typo.';
                }
                return;
            }

            const result = await fetchTokenMetadata(addr);
            if (seq !== fetchSeq) return; // a newer lookup superseded this one — drop it

            if (result.success && result.data) {
                // For a curated token, keep the registry's trusted name/symbol/icon
                // (avoids the SAC's raw on-chain name overwriting "USD Coin" — a flash
                // + downgrade) but take decimals from the CHAIN: the registry's 7 is
                // right for classic SACs today, yet a future non-7 entry must not
                // silently mis-scale money math. Registry decimals is only the fallback.
                const merged: TokenMetadata = curated
                    ? {
                          name: curated.name,
                          symbol: curated.symbol,
                          decimals: result.data.decimals ?? curated.decimals,
                          totalSupply: result.data.totalSupply ?? null,
                          logoUrl: curated.iconUrl ?? result.data.logoUrl ?? null,
                      }
                    : result.data;
                tokenMetadata = merged;
                // Sync to store immediately
                wizardStore.setTokenDetails({
                    tokenAddress: addr,
                    // Coalesce: name/symbol/supply can still be null — downstream
                    // BigInt/render code must not see null. Default decimals to 7
                    // (Stellar), never EVM's 18.
                    tokenName: merged.name ?? '',
                    tokenSymbol: merged.symbol ?? '',
                    tokenDecimals: merged.decimals ?? 7,
                    tokenTotalSupply: merged.totalSupply ?? '0',
                    iconUrl: merged.logoUrl,
                    // Persist trust now; acknowledgement is only committed on Continue
                    // (handleNext), so a deep-link to step-1 before then re-gates.
                    trust: curated ? 'curated' : 'imported',
                    acknowledged: false,
                });
            } else if (!tokenMetadata) {
                // Keep a curated registry-seeded card instead of dead-ending (D5).
                error = result.error || 'Could not fetch token metadata';
            }
        } catch {
            if (seq === fetchSeq && !tokenMetadata) {
                error = 'Network error while fetching metadata';
            }
        } finally {
            if (seq === fetchSeq) isFetching = false;
        }
    }

    function handleNext() {
        // Imported (unverified) tokens require an explicit acknowledgement (D4).
        if (selectedTrust === 'imported' && !acknowledged) return;
        // Commit the gate decision to the store so step-1 can re-assert it on a
        // direct navigation / deep-link (the in-memory check alone wouldn't survive).
        wizardStore.setTokenDetails({ trust: selectedTrust, acknowledged });
        wizardStore.nextStep();
        goto('/wizard/step-1');
    }

    // Stellar Expert link for the selected contract. getContractExplorerUrl reads
    // the non-reactive runtime singleton, so depend on networkStore.activeId to
    // recompute when the user toggles networks (same trick the presets use).
    const explorerUrl = $derived.by(() => {
        void networkStore.activeId; // touch the reactive dep so this recomputes on network toggle
        return tokenAddress ? getContractExplorerUrl(tokenAddress) : '#';
    });

    let copied = $state(false);
    let copyTimer: ReturnType<typeof setTimeout> | null = null;

    // Animated example for the empty-state hint: a fixed, emphasized white "C"
    // followed by 55 base32 chars — a real contract id's full length (56) — that
    // shimmer slowly like matrix rain (only a few positions flip per tick).
    // Decorative (aria-hidden). The $effect depends on `tokenAddress`, so the
    // interval tears down the moment the input is filled or the component
    // unmounts, and it stays static under prefers-reduced-motion. The initial
    // value is deterministic (dots) so SSR/hydration never sees a random diff.
    const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // StrKey alphabet, like real C… ids
    const EXAMPLE_LEN = 55; // chars after the fixed "C" → 56 total
    const randChar = () => BASE32[Math.floor(Math.random() * BASE32.length)];
    let exampleChars = $state<string[]>(Array(EXAMPLE_LEN).fill('•'));
    $effect(() => {
        if (tokenAddress) return; // only animate while the input is empty
        let chars = Array.from({ length: EXAMPLE_LEN }, randChar);
        exampleChars = chars;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const id = setInterval(() => {
            chars = chars.slice();
            for (let k = 0; k < 3; k++) chars[Math.floor(Math.random() * EXAMPLE_LEN)] = randChar();
            exampleChars = chars;
        }, 150);
        return () => clearInterval(id);
    });

    async function copyAddress() {
        try {
            await navigator.clipboard.writeText(tokenAddress);
            copied = true;
            // Reset any prior timer so a rapid second copy doesn't get its
            // "Copied!" state cleared early; onMount clears it on unmount.
            if (copyTimer) clearTimeout(copyTimer);
            copyTimer = setTimeout(() => (copied = false), 2000);
        } catch {
            warn('Clipboard API not available');
        }
    }

    // Clear the confirmed selection and return to the picker state. The input,
    // chips and search trigger are gated on `!tokenMetadata`, so resetting here
    // re-reveals them; refocus the input so a keyboard user can act immediately.
    function changeToken() {
        selectedPreset = null;
        tokenAddress = '';
        acknowledged = false;
        selectedTrust = 'curated';
        resetLookup(); // clears tokenMetadata + error, bumps fetchSeq
        // Clear the persisted token too, so the empty UI and the store agree — a
        // stale token must not leak into step-1's guard if the user leaves now.
        wizardStore.setTokenDetails({
            tokenAddress: null,
            tokenName: null,
            tokenSymbol: null,
            tokenDecimals: null,
            tokenTotalSupply: null,
            iconUrl: null,
            trust: null,
            acknowledged: false,
        });
        tick().then(() => inputEl?.focus());
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

<!-- SR-only live region: neither the visual spinner nor the result card announce
     themselves, and the instant curated-card path renders no spinner node at all,
     so screen-reader users would otherwise hear silence during lookup/selection. -->
<div class="sr-only" role="status" aria-live="polite">
    {#if isFetching && !tokenMetadata}
        Looking up token on Stellar…
    {:else if tokenMetadata}
        {tokenMetadata.name || tokenMetadata.symbol} selected — {selectedTrust === 'imported'
            ? 'unverified; confirm the contract address to continue'
            : 'verified'}.
    {/if}
</div>

<div class="min-h-[50vh] flex flex-col items-center justify-center p-4 relative overflow-hidden">
    <!-- Background Decor -->
    <div
        class="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-125 h-125 bg-zen-fg/5 rounded-full blur-[120px] pointer-events-none"
    ></div>

    <div class="w-full max-w-2xl text-center space-y-10">
        <!-- Input Section — hidden once a token is confirmed; the card owns identity. -->
        {#if !tokenMetadata}
            <!-- One wrapper so the surrounding space-y-10 treats input+hint as a
                 single unit; .relative.group wraps only the input so the paste
                 button stays vertically centered on it. -->
            <div>
                <div class="relative group">
                    <input
                        type="text"
                        placeholder="Paste Token Contract ID"
                        aria-label="Token contract ID"
                        class="w-full bg-transparent border-none font-light font-mono placeholder:font-sans placeholder:text-zen-fg-faint text-zen-fg focus:outline-none focus:ring-0 transition-all duration-300 {tokenAddress
                            ? 'text-left text-base sm:text-lg'
                            : 'text-center text-lg sm:text-2xl md:text-3xl px-4 sm:px-12'}"
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
                </div>

                <!-- Animated example, contained: emphasized white "C" + full-length
                 matrix base32 in a fixed-width mono field that fades out at the
                 right edge (mask); one line, never wraps or overflows. -->
                {#if !tokenAddress}
                    <div
                        class="mx-auto mt-3 flex w-full max-w-xs items-center gap-2 rounded-lg border-[0.5px] border-zen-border-subtle bg-zen-fg/5 px-2.5 py-1.5"
                        aria-hidden="true"
                    >
                        <span
                            class="shrink-0 text-[10px] uppercase tracking-wider text-zen-fg-faint"
                            >e.g.</span
                        >
                        <span
                            class="min-w-0 flex-1 overflow-hidden whitespace-nowrap font-mono text-xs text-zen-fg-faint mask-[linear-gradient(to_right,black_72%,transparent)]"
                            ><span class="font-semibold text-zen-fg">C</span>{exampleChars.join(
                                '',
                            )}</span
                        >
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
        {/if}

        <!-- Quick-Launch Presets + token picker trigger -->
        {#if !tokenMetadata}
            <div class="flex flex-wrap items-center justify-center gap-2">
                {#if presets.length > 0}
                    <div
                        class="flex flex-wrap items-center justify-center gap-2"
                        role="group"
                        aria-label="Popular tokens"
                    >
                        <span class="text-xs text-zen-fg-faint mr-1">Popular:</span>
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
        <div class="min-h-32 flex items-center justify-center">
            {#if isFetching && !tokenMetadata}
                <div
                    class="flex flex-col items-center gap-3 text-zen-fg-faint"
                    in:fade={{ duration: reduceMotion ? 0 : 200 }}
                >
                    <Loader2 class="w-6 h-6 animate-spin text-zen-fg" />
                    <span class="text-sm tracking-widest uppercase text-[10px]"
                        >Looking up token</span
                    >
                </div>
            {:else if tokenMetadata}
                {@const cardLogo = tokenMetadata.logoUrl ?? selectedPreset?.iconUrl}
                {@const imported = selectedTrust === 'imported'}
                <div
                    in:fly={{ y: reduceMotion ? 0 : 10, duration: reduceMotion ? 0 : 400 }}
                    class="w-full max-w-md mx-auto space-y-3 text-left"
                >
                    <ZenCard class="flex items-center gap-5 p-4">
                        <!-- Logo Box -->
                        <div class="shrink-0">
                            {#if cardLogo}
                                <img src={cardLogo} alt="" class="w-12 h-12 rounded-full" />
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
                            <div class="flex items-baseline justify-between gap-3 mb-1">
                                <h3 class="text-lg font-medium text-zen-fg truncate">
                                    {tokenMetadata.name}
                                </h3>
                                <span
                                    class="text-[10px] uppercase tracking-widest shrink-0 {imported
                                        ? 'text-zen-warning'
                                        : 'text-zen-success'}"
                                >
                                    {imported ? 'Unverified' : 'Verified'}
                                </span>
                            </div>

                            <div class="flex items-center gap-3">
                                <span
                                    class="font-mono text-xs text-zen-fg-muted px-1.5 py-0.5 bg-zen-fg/5 rounded-md"
                                >
                                    {tokenMetadata.symbol}
                                </span>
                                <div class="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onclick={copyAddress}
                                        title={copied ? 'Copied!' : 'Copy contract address'}
                                        aria-label={copied
                                            ? 'Address copied'
                                            : 'Copy contract address'}
                                        class="inline-flex items-center gap-1 rounded font-mono text-xs text-zen-fg-faint transition-colors hover:text-zen-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zen-bg"
                                    >
                                        <span class="truncate"
                                            >{tokenAddress.slice(0, 6)}…{tokenAddress.slice(
                                                -4,
                                            )}</span
                                        >
                                        {#if copied}
                                            <Check
                                                class="w-3 h-3 text-zen-success"
                                                aria-hidden="true"
                                            />
                                        {:else}
                                            <Copy class="w-3 h-3" aria-hidden="true" />
                                        {/if}
                                    </button>
                                    <Tooltip text="Verify on Stellar Expert" position="top">
                                        <a
                                            href={explorerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label="Verify contract on Stellar Expert"
                                            class="flex rounded p-1.5 text-zen-fg-faint transition-colors hover:text-zen-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zen-bg"
                                        >
                                            <ExternalLink class="w-3 h-3" aria-hidden="true" />
                                        </a>
                                    </Tooltip>
                                </div>
                            </div>
                        </div>
                    </ZenCard>

                    {#if imported}
                        <div class="rounded-xl border border-zen-warning/30 bg-zen-warning/5 p-3">
                            <p
                                id="token-ack-warning"
                                class="flex items-start gap-2 text-xs text-zen-fg-muted"
                            >
                                <AlertTriangle class="w-4 h-4 text-zen-warning shrink-0 mt-px" />
                                <span>
                                    Anyone can deploy a token using a familiar name. Confirm this is
                                    the exact contract you mean to distribute — sending the wrong
                                    asset can't be undone.
                                </span>
                            </p>
                            <p
                                class="mt-2 pl-6 font-mono text-[11px] leading-relaxed text-zen-fg-muted break-all"
                            >
                                {tokenAddress}
                            </p>
                            <div class="mt-2.5 pl-6">
                                <ZenCheckbox
                                    bind:checked={acknowledged}
                                    label="I've verified this contract address"
                                    aria-describedby="token-ack-warning"
                                />
                            </div>
                        </div>
                    {/if}

                    <ZenButton
                        variant="primary"
                        size="lg"
                        class="w-full"
                        disabled={imported && !acknowledged}
                        aria-describedby={imported && !acknowledged
                            ? 'token-ack-warning'
                            : undefined}
                        onclick={handleNext}
                    >
                        Continue <ArrowRight class="w-4 h-4 ml-1" />
                    </ZenButton>

                    <button
                        type="button"
                        onclick={changeToken}
                        class="mx-auto flex items-center gap-1.5 rounded text-xs text-zen-fg-faint transition-colors hover:text-zen-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zen-bg"
                    >
                        <ArrowLeft class="w-3.5 h-3.5" /> Choose a different token
                    </button>
                </div>
            {:else if tokenAddress && !isAddressValid}
                <div
                    class="text-zen-fg-faint text-sm"
                    aria-live="polite"
                    in:fade={{ duration: reduceMotion ? 0 : 200 }}
                >
                    {#if !tokenAddress.startsWith('C')}
                        Contract IDs start with "C"
                    {:else if tokenAddress.length < 56}
                        <span class="font-mono">{tokenAddress.length}</span>/56 characters
                    {:else}
                        Invalid contract format
                    {/if}
                </div>
            {:else if !tokenAddress}
                <p class="text-zen-fg-muted text-sm font-light">Stellar tokens only</p>
            {/if}
        </div>
    </div>

    <TokenPickerModal
        open={pickerOpen}
        onclose={() => (pickerOpen = false)}
        onselect={handlePicked}
    />
</div>
