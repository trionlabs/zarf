<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { fly } from 'svelte/transition';
    import { Clipboard, ArrowRight, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { isValidContractAddressShape } from '@zarf/core/utils/addressShape';
    import { isChecksumValidContract } from '@zarf/core/utils/tokenAsset';
    import { readTokenMetaRpc } from '@zarf/core/contracts';
    import { warn } from '@zarf/core/utils/log';
    import { campaignStore } from '$lib/airdrop/stores/campaignStore.svelte';
    import type { StellarAddress, StellarContractId } from '$lib/airdrop/stores/types';

    let tokenAddress = $state('');
    let checking = $state(false);
    let checksumValid = $state<boolean | null>(null);
    let acknowledged = $state(false);

    let meta = $state<{ name: string; symbol: string; decimals: number } | null>(null);
    let metaLoading = $state(false);
    let metaError = $state<string | null>(null);

    let debounce: ReturnType<typeof setTimeout> | null = null;
    let checkSeq = 0;

    const shapeValid = $derived(isValidContractAddressShape(tokenAddress.trim()));
    const reduceMotion =
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    onMount(() => {
        campaignStore.goToStep(0);
        const td = campaignStore.tokenDetails;
        if (td.tokenAddress) {
            tokenAddress = td.tokenAddress;
            acknowledged = !!td.acknowledged;
            if (td.tokenDecimals !== null && td.tokenSymbol) {
                meta = {
                    name: td.tokenName ?? td.tokenSymbol,
                    symbol: td.tokenSymbol,
                    decimals: td.tokenDecimals,
                };
            }
            void runChecks();
        }
    });

    async function runChecks() {
        const addr = tokenAddress.trim();
        const seq = ++checkSeq;
        checksumValid = null;
        if (!isValidContractAddressShape(addr)) return;
        checking = true;
        try {
            const ok = await isChecksumValidContract(addr);
            if (seq !== checkSeq) return;
            checksumValid = ok;
        } catch (e) {
            if (seq === checkSeq) checksumValid = false;
            warn('[step-0] checksum check failed', e);
        } finally {
            if (seq === checkSeq) checking = false;
        }
    }

    function handleInput() {
        meta = null;
        metaError = null;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(runChecks, 300);
    }

    async function handlePaste() {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (text) {
                tokenAddress = text;
                handleInput();
            }
        } catch {
            /* clipboard unavailable — user can paste manually */
        }
    }

    // Load on-chain metadata once a wallet is connected (RPC simulation needs a
    // real source account). Best-effort: decimals are re-read at deploy time if
    // this never runs.
    $effect(() => {
        const source = walletStore.address as StellarAddress | null;
        const addr = tokenAddress.trim();
        if (!source || checksumValid !== true || !addr || meta || metaLoading) return;
        metaLoading = true;
        metaError = null;
        readTokenMetaRpc(source, addr as StellarContractId)
            .then((m) => {
                meta = m;
            })
            .catch((e) => {
                metaError = 'Could not read token details from the network.';
                warn('[step-0] token meta read failed', e);
            })
            .finally(() => {
                metaLoading = false;
            });
    });

    const canContinue = $derived(checksumValid === true && acknowledged);

    function handleNext() {
        if (!canContinue) return;
        campaignStore.setTokenDetails({
            tokenAddress: tokenAddress.trim() as StellarContractId,
            tokenName: meta?.name ?? null,
            tokenSymbol: meta?.symbol ?? null,
            tokenDecimals: meta?.decimals ?? null,
            acknowledged: true,
        });
        campaignStore.nextStep();
        goto('/airdrop/wizard/step-1');
    }
</script>

<div class="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-8 py-10">
    <header class="text-center">
        <h1 class="text-2xl font-semibold tracking-tight text-zen-fg">Choose a token</h1>
        <p class="mt-2 text-sm text-zen-fg-muted">
            Paste the contract id of the token you want to distribute.
        </p>
    </header>

    <div class="group relative">
        <input
            type="text"
            placeholder="Paste token contract id (C…)"
            aria-label="Token contract id"
            bind:value={tokenAddress}
            oninput={handleInput}
            spellcheck="false"
            autocomplete="off"
            autocapitalize="characters"
            class="w-full rounded-xl border border-zen-border-subtle bg-zen-bg px-4 py-3 pr-12 font-mono text-sm text-zen-fg focus:outline-none focus:ring-1 focus:ring-zen-fg/30"
        />
        {#if !tokenAddress}
            <div class="absolute top-1/2 right-2 -translate-y-1/2">
                <ZenButton
                    variant="ghost"
                    size="sm"
                    onclick={handlePaste}
                    aria-label="Paste from clipboard"
                >
                    <Clipboard class="w-4 h-4" />
                </ZenButton>
            </div>
        {/if}
    </div>

    <!-- Status -->
    {#if tokenAddress && !shapeValid}
        <p class="text-center text-sm text-zen-error">That doesn't look like a contract id (C…).</p>
    {:else if checking}
        <p class="flex items-center justify-center gap-2 text-sm text-zen-fg-muted">
            <Loader2 class="w-4 h-4 animate-spin" /> Verifying contract id…
        </p>
    {:else if checksumValid === false}
        <p class="text-center text-sm text-zen-error">
            That contract id fails its checksum — check for a typo.
        </p>
    {:else if checksumValid === true}
        <div
            in:fly={{ y: reduceMotion ? 0 : 8, duration: reduceMotion ? 0 : 300 }}
            class="space-y-4"
        >
            <ZenCard class="flex items-center gap-4 p-4">
                <div
                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zen-border-subtle bg-zen-fg/5 font-mono text-base font-bold text-zen-fg-faint"
                >
                    {meta?.symbol?.charAt(0) ?? '?'}
                </div>
                <div class="min-w-0 flex-1">
                    {#if metaLoading}
                        <span class="flex items-center gap-2 text-sm text-zen-fg-muted">
                            <Loader2 class="w-3.5 h-3.5 animate-spin" /> Reading token details…
                        </span>
                    {:else if meta}
                        <div class="flex items-baseline gap-2">
                            <h3 class="truncate text-base font-medium text-zen-fg">{meta.name}</h3>
                            <span class="text-xs text-zen-fg-subtle">{meta.symbol}</span>
                        </div>
                        <p class="text-xs text-zen-fg-faint">{meta.decimals} decimals</p>
                    {:else}
                        <p class="text-sm text-zen-fg-muted">
                            {metaError ?? 'Connect a wallet to load token details.'}
                        </p>
                    {/if}
                    <p class="mt-1 break-all font-mono text-[11px] text-zen-fg-faint">
                        {tokenAddress.trim()}
                    </p>
                </div>
            </ZenCard>

            <div class="rounded-xl border border-zen-warning/30 bg-zen-warning/5 p-3">
                <p id="token-ack" class="flex items-start gap-2 text-xs text-zen-fg-muted">
                    <AlertTriangle class="mt-px h-4 w-4 shrink-0 text-zen-warning" />
                    <span>
                        Anyone can deploy a token with a familiar name. Confirm this is the exact
                        contract you mean to distribute — sending the wrong asset can't be undone.
                    </span>
                </p>
                <div class="mt-2.5 pl-6">
                    <ZenCheckbox
                        bind:checked={acknowledged}
                        label="I've verified this contract address"
                        aria-describedby="token-ack"
                    />
                </div>
            </div>

            <ZenButton
                variant="primary"
                class="w-full"
                disabled={!canContinue}
                onclick={handleNext}
            >
                {#if canContinue}
                    <CheckCircle2 class="mr-1 h-4 w-4" />
                {/if}
                Continue <ArrowRight class="ml-1 h-4 w-4" />
            </ZenButton>
        </div>
    {/if}
</div>
