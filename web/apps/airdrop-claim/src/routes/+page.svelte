<script lang="ts">
    import { page } from '$app/state';
    import { CheckCircle2, Gift, ExternalLink, Wallet } from 'lucide-svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenSpinner from '@zarf/ui/components/ui/ZenSpinner.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import ZenBadge from '@zarf/ui/components/ui/ZenBadge.svelte';
    import AddressInput from '@zarf/ui/components/ui/AddressInput.svelte';
    import { sanitizeBlockchainError } from '@zarf/ui/utils/errorSanitizer';
    import { formatTokenAmount } from '@zarf/core/utils/amount';
    import { getContractExplorerUrl, getExplorerUrl } from '@zarf/core/contracts/explorer';
    import {
        loadClaimList,
        findClaim,
        deriveClaimStatus,
        type MatchedClaim,
    } from '$lib/services/airdropClaim';

    // Type-only aliases via import() so neither stellar-sdk-pulling module
    // (@zarf/core/contracts, @zarf/core/merkle) lands in the eager bundle.
    type AirdropConfig = import('@zarf/core/contracts').AirdropConfig;
    type AirdropClaimListJson = import('@zarf/core/merkle').AirdropClaimListJson;

    // --- URL context (?a=<airdrop>&cid=<cid>[&addr=<preview>]) ---
    const airdropId = $derived(page.url.searchParams.get('a') ?? '');
    const cid = $derived(page.url.searchParams.get('cid') ?? '');
    const hasLink = $derived(airdropId.length > 0 && cid.length > 0);

    // --- loaded claim-list ---
    let doc = $state<AirdropClaimListJson | null>(null);
    let loading = $state(false);
    let loadFailed = $state(false);
    let loadErrorMsg = $state<string | null>(null);

    // --- on-chain reads (lazy: stellar-sdk loads only here) ---
    let config = $state<AirdropConfig | null>(null);
    let isClaimedOnChain = $state<boolean | null>(null);
    let decimals = $state<number | null>(null);
    let tokenSymbol = $state<string | null>(null);
    let chainReadFailed = $state(false);

    // --- claim tx ---
    let submitting = $state(false);
    let txHash = $state<string | null>(null);
    let txError = $state<string | null>(null);

    const nowSec = Math.floor(Date.now() / 1000);

    // Reactive wallet address (null unless connected).
    const walletAddr = $derived(walletStore.isConnected ? walletStore.address : null);
    const appNetwork = $derived(networkStore.activeId === 'mainnet' ? 'mainnet' : 'testnet');

    // Wallet-path match (instant, pure — findClaim is stellar-sdk-free).
    const matched = $derived(doc && walletAddr ? findClaim(doc, walletAddr) : null);
    // Set after the lazy proof module loads (it pulls stellar-sdk via merkle).
    let proofValid = $state<boolean | null>(null);

    // Root-binding (trap #1): the list root must equal the on-chain config root.
    const rootMatches = $derived(config && doc ? config.merkleRoot === doc.root : null);
    const deadline = $derived(config ? config.deadline : null);

    const status = $derived(
        deriveClaimStatus({
            loading,
            loadFailed: loadFailed || chainReadFailed,
            doc,
            appNetwork,
            walletConnected: !!walletAddr,
            walletWrongNetwork: walletStore.isWrongNetwork,
            matched,
            proofValid,
            rootMatches,
            deadline,
            isClaimedOnChain,
            nowSec,
            tx: { submitting, success: !!txHash, failed: !!txError },
        }),
    );

    function resetState() {
        doc = null;
        loadFailed = false;
        loadErrorMsg = null;
        config = null;
        isClaimedOnChain = null;
        decimals = null;
        tokenSymbol = null;
        chainReadFailed = false;
        txHash = null;
        txError = null;
        proofValid = null;
        lastReadKey = null;
    }

    // --- load the claim-list when the cid changes (reset-on-change) ---
    let lastCid = $state<string | null>(null);
    $effect(() => {
        if (!hasLink || cid === lastCid) return;
        lastCid = cid;
        resetState();
        loading = true;
        loadClaimList(cid)
            .then((d) => (doc = d))
            .catch((e: unknown) => {
                loadFailed = true;
                loadErrorMsg = e instanceof Error ? e.message : 'Could not load the airdrop list.';
            })
            .finally(() => (loading = false));
    });

    // --- lazy-verify the proof + read on-chain config/claimed once matched ---
    // Both the proof module (merkle) and the contracts module pull stellar-sdk,
    // so they load HERE — after the wallet connects — not on initial paint.
    let lastReadKey = $state<string | null>(null);
    $effect(() => {
        if (!doc || !walletAddr || !matched) return;
        const key = `${doc.airdrop}:${matched.index}:${walletAddr}`;
        if (key === lastReadKey) return;
        lastReadKey = key;
        proofValid = null;
        config = null;
        isClaimedOnChain = null;
        chainReadFailed = false;
        void verifyAndRead(doc, walletAddr, matched);
    });

    async function verifyAndRead(d: AirdropClaimListJson, source: string, m: MatchedClaim) {
        try {
            const [{ verifyClaimProof }, contracts] = await Promise.all([
                import('$lib/services/proof'),
                import('@zarf/core/contracts'),
            ]);
            const ok = verifyClaimProof(d, m);
            proofValid = ok;
            if (!ok) return; // invalid-list — no point reading on-chain
            const [cfg, claimed, meta] = await Promise.all([
                contracts.getAirdropConfig(source, d.airdrop),
                contracts.isAirdropClaimed(source, d.airdrop, m.index),
                contracts.readTokenMetaRpc(source, d.token),
            ]);
            config = cfg;
            isClaimedOnChain = claimed;
            decimals = meta.decimals;
            tokenSymbol = meta.symbol;
        } catch {
            chainReadFailed = true;
        }
    }

    async function handleClaim() {
        if (!doc || !walletAddr || !matched || submitting) return;
        submitting = true;
        txError = null;
        try {
            const { claimAirdrop } = await import('@zarf/core/contracts');
            const { hash } = await claimAirdrop({
                airdrop: doc.airdrop,
                index: matched.index,
                claimant: walletAddr,
                amount: BigInt(matched.amount),
                proof: matched.proof,
            });
            txHash = hash;
        } catch (e) {
            txError = sanitizeBlockchainError(e, { fallback: 'Claim failed — please try again.' });
        } finally {
            submitting = false;
        }
    }

    function retry() {
        lastCid = null; // re-trigger the load effect
    }

    // --- read-only address preview (no wallet needed; pre-filled from ?addr=) ---
    let previewInput = $state(page.url.searchParams.get('addr') ?? '');
    const previewMatched = $derived(
        doc && previewInput.trim() ? findClaim(doc, previewInput) : null,
    );

    function fmt(amount: string): string {
        return decimals === null ? amount : formatTokenAmount(BigInt(amount), decimals);
    }
    const symbol = $derived(tokenSymbol ?? 'tokens');
</script>

<svelte:head>
    <title>Claim your airdrop — Zarf</title>
</svelte:head>

<main id="main" class="mx-auto max-w-lg py-10" aria-live="polite">
    {#if !hasLink}
        <div class="py-16 text-center">
            <div
                class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zen-fg/5"
            >
                <Gift class="h-6 w-6 text-zen-fg-muted" />
            </div>
            <h1 class="text-2xl font-semibold tracking-tight text-zen-fg">Claim your airdrop</h1>
            <p class="mt-2 text-sm text-zen-fg-muted">
                Open the claim link you were given to check your allocation.
            </p>
        </div>
    {:else}
        <ZenCard class="space-y-5 p-6">
            <!-- Transparency header -->
            <header class="flex items-start justify-between gap-4">
                <div>
                    <h1 class="text-lg font-semibold tracking-tight text-zen-fg">Airdrop</h1>
                    {#if doc}
                        <p class="mt-0.5 text-xs text-zen-fg-muted">
                            {doc.claims.length} recipients{#if config}
                                · {fmt(config.total.toString())}
                                {symbol} total{/if}
                        </p>
                    {/if}
                </div>
                {#if doc}
                    <ZenBadge variant={doc.network === 'mainnet' ? 'primary' : 'info'}>
                        {doc.network}
                    </ZenBadge>
                {/if}
            </header>

            <!-- State machine body -->
            {#if status === 'loading'}
                <div class="flex items-center justify-center gap-3 py-8 text-sm text-zen-fg-muted">
                    <ZenSpinner size="sm" /> Loading…
                </div>
            {:else if status === 'load-error'}
                <ZenAlert variant="error">
                    {loadErrorMsg ?? 'Could not load this airdrop.'}
                </ZenAlert>
                <ZenButton variant="secondary" onclick={retry}>Try again</ZenButton>
            {:else if status === 'invalid-list'}
                <ZenAlert variant="error">
                    This claim link doesn’t match the on-chain airdrop. Don’t trust it.
                </ZenAlert>
            {:else if status === 'wrong-network'}
                <ZenAlert variant="warning">
                    This airdrop is on <strong>{doc?.network}</strong>. Switch your wallet and app
                    to
                    {doc?.network} to continue.
                </ZenAlert>
            {:else if status === 'no-wallet'}
                <div class="space-y-4">
                    <p class="text-sm text-zen-fg-muted">
                        Connect your wallet to check your allocation and claim.
                    </p>
                    <ZenButton variant="primary" onclick={() => walletStore.requestConnection()}>
                        <Wallet class="mr-1.5 h-4 w-4" /> Connect wallet
                    </ZenButton>

                    <div class="border-t border-zen-border-subtle pt-4">
                        <p class="mb-2 text-xs text-zen-fg-muted">Or check an address:</p>
                        <AddressInput bind:value={previewInput} placeholder="G… or C…" />
                        {#if previewInput.trim()}
                            <p
                                class="mt-2 text-xs {previewMatched
                                    ? 'text-zen-success'
                                    : 'text-zen-fg-faint'}"
                            >
                                {#if previewMatched}
                                    ✓ This address is on the list — connect it to claim.
                                {:else}
                                    This address isn’t in this airdrop.
                                {/if}
                            </p>
                        {/if}
                    </div>
                </div>
            {:else if status === 'not-in-list'}
                <ZenAlert variant="info">This wallet isn’t in this airdrop.</ZenAlert>
            {:else if status === 'expired'}
                <ZenAlert variant="warning">The claim window for this airdrop has closed.</ZenAlert>
            {:else if status === 'already-claimed'}
                <div class="space-y-3 py-2 text-center">
                    <CheckCircle2 class="mx-auto h-10 w-10 text-zen-success" />
                    <p class="text-sm font-medium text-zen-fg">
                        You’ve already claimed this airdrop.
                    </p>
                    {#if doc}
                        <a
                            href={getContractExplorerUrl(doc.airdrop)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 text-xs text-zen-fg-muted hover:text-zen-fg"
                        >
                            View on explorer <ExternalLink class="h-3 w-3" />
                        </a>
                    {/if}
                </div>
            {:else if status === 'success'}
                <div class="space-y-3 py-2 text-center">
                    <CheckCircle2 class="mx-auto h-12 w-12 text-zen-success" />
                    <p class="text-base font-semibold text-zen-fg">Claimed!</p>
                    {#if matched}
                        <p class="text-sm text-zen-fg-muted">
                            {fmt(matched.amount)}
                            {symbol} is on its way to your wallet.
                        </p>
                    {/if}
                    {#if txHash}
                        <a
                            href={getExplorerUrl(txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 text-xs text-zen-fg-muted hover:text-zen-fg"
                        >
                            View transaction <ExternalLink class="h-3 w-3" />
                        </a>
                    {/if}
                </div>
            {:else if status === 'eligible' || status === 'submitting' || status === 'tx-error'}
                <div class="space-y-4">
                    {#if matched}
                        <div class="rounded-xl bg-zen-fg/[0.03] p-4 text-center">
                            <p class="text-xs text-zen-fg-muted">You’re eligible for</p>
                            <p class="mt-1 text-2xl font-semibold tabular-nums text-zen-fg">
                                {fmt(matched.amount)}
                                <span class="text-sm font-normal text-zen-fg-subtle">{symbol}</span>
                            </p>
                        </div>
                    {/if}
                    {#if status === 'tx-error' && txError}
                        <ZenAlert variant="error">{txError}</ZenAlert>
                    {/if}
                    <ZenButton
                        variant="primary"
                        onclick={handleClaim}
                        loading={submitting}
                        disabled={submitting}
                    >
                        {status === 'tx-error' ? 'Try claim again' : 'Claim'}
                    </ZenButton>
                    <p class="text-center text-xs text-zen-fg-faint">
                        You pay a small network fee in XLM.
                    </p>
                </div>
            {/if}
        </ZenCard>
    {/if}
</main>
