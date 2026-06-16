<script lang="ts">
    import { goto } from '$app/navigation';
    import { Plus, ExternalLink, Lock, Unlock, Clock, Copy, Check, Coins } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenBadge from '@zarf/ui/components/ui/ZenBadge.svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { sanitizeBlockchainError, type ErrorRule } from '@zarf/ui/utils/errorSanitizer';
    import { getContractExplorerUrl, getExplorerUrl } from '@zarf/core/contracts/explorer';
    import { formatTokenAmount } from '@zarf/core/utils/amount';
    import { warn } from '@zarf/core/utils/log';
    import { campaignStore } from '$lib/stores/campaignStore.svelte';
    import type { Campaign } from '$lib/stores/types';
    import type { StellarAddress } from '@zarf/core';

    // Type-only alias via import() so @zarf/core/contracts (stellar-sdk) stays
    // out of this route's eager bundle — the helpers are dynamic-imported below.
    type AirdropProgress = import('@zarf/core/contracts').AirdropProgress;

    const campaigns = $derived(campaignStore.campaigns);
    const nowSec = Math.floor(Date.now() / 1000);
    const walletAddr = $derived(
        walletStore.isConnected ? (walletStore.address as StellarAddress) : null,
    );

    // --- live claimed counters (read once per wallet + launched-set, then after a
    // reclaim). No polling: an RPC-direct sweep is ceil(N/80) reads per campaign,
    // so the dashboard reads sequentially on connect rather than on a timer (the
    // indexer makes this cheap in M7). ---
    let progressById = $state<Record<string, AirdropProgress>>({});
    let lastProgressKey = $state<string | null>(null);
    $effect(() => {
        const launched = campaigns.filter((c) => c.state === 'launched');
        if (!walletAddr || launched.length === 0) return;
        const key = `${walletAddr}:${launched.map((c) => c.id).join(',')}`;
        if (key === lastProgressKey) return;
        lastProgressKey = key;
        void loadProgress(launched, walletAddr);
    });

    async function readProgress(c: Campaign, source: StellarAddress) {
        try {
            const { getAirdropProgress } = await import('@zarf/core/contracts');
            const p = await getAirdropProgress(c.airdropAddress, {
                source,
                recipientCount: c.recipientCount,
            });
            progressById = { ...progressById, [c.id]: p };
        } catch (e) {
            warn('[airdrop-create] progress read failed', c.airdropAddress, e);
        }
    }
    async function loadProgress(list: Campaign[], source: StellarAddress) {
        for (const c of list) await readProgress(c, source);
    }

    function deadlineLabel(c: Campaign): string {
        if (c.deadline === 0) return 'No deadline';
        const secs = c.deadline - nowSec;
        if (secs <= 0) return 'Claim window ended';
        const days = Math.floor(secs / 86400);
        const hours = Math.floor((secs % 86400) / 3600);
        if (days > 0) return `Ends in ${days}d ${hours}h`;
        const mins = Math.floor((secs % 3600) / 60);
        return hours > 0 ? `Ends in ${hours}h ${mins}m` : `Ends in ${mins}m`;
    }

    // Reclaim eligibility (state-only; the on-chain reclaim ships with the claim
    // release). Locked funds reclaim only after the deadline; open funds anytime.
    function canReclaim(c: Campaign): boolean {
        if (c.state !== 'launched') return false;
        if (!c.locked) return true;
        return c.deadline !== 0 && c.deadline <= nowSec;
    }
    function reclaimHint(c: Campaign): string {
        if (canReclaim(c)) return 'Unclaimed funds can be reclaimed.';
        if (c.locked && c.deadline === 0)
            return 'Locked with no deadline — funds can never be reclaimed.';
        if (c.locked) return 'Locked until the deadline.';
        return '';
    }

    let copiedId = $state<string | null>(null);

    // --- reclaim (withdraw_unclaimed) tx state ---
    let reclaimingId = $state<string | null>(null);
    let reclaimError = $state<{ id: string; message: string } | null>(null);
    let reclaimedTx = $state<Record<string, string>>({});

    // The instance's withdraw reverts (surfaced over RPC as numeric
    // `Error(Contract, #N)`) → actionable copy. 02 §3.7 error codes.
    const RECLAIM_ERROR_RULES: ErrorRule[] = [
        {
            match: /NotYetWithdrawable|Contract, ?#4\b/i,
            message: 'These funds aren’t withdrawable yet — they unlock after the deadline.',
        },
        {
            match: /NothingToWithdraw|Contract, ?#7\b/i,
            message: 'There’s nothing left to reclaim.',
        },
    ];

    function claimLink(c: Campaign): string {
        const base =
            (import.meta.env.VITE_AIRDROP_CLAIM_URL ?? '').replace(/\/+$/, '') ||
            (typeof window !== 'undefined' ? window.location.origin : '');
        return `${base}/?a=${encodeURIComponent(c.airdropAddress)}&cid=${encodeURIComponent(c.metadataCid)}`;
    }
    function copyClaim(c: Campaign) {
        navigator.clipboard.writeText(claimLink(c));
        copiedId = c.id;
        setTimeout(() => (copiedId = null), 2000);
    }

    async function onReclaim(c: Campaign) {
        if (!walletAddr || reclaimingId) return;
        reclaimingId = c.id;
        reclaimError = null;
        try {
            const { withdrawAirdrop } = await import('@zarf/core/contracts');
            // admin signs + pays the fee; `to` defaults to the admin (reclaim to self).
            const { hash } = await withdrawAirdrop({
                airdrop: c.airdropAddress,
                admin: walletAddr,
            });
            reclaimedTx = { ...reclaimedTx, [c.id]: hash };
            void readProgress(c, walletAddr); // balance swept → refresh the counter
        } catch (e) {
            reclaimError = {
                id: c.id,
                message: sanitizeBlockchainError(e, {
                    customRules: RECLAIM_ERROR_RULES,
                    fallback: 'Reclaim failed — please try again.',
                }),
            };
        } finally {
            reclaimingId = null;
        }
    }
</script>

<svelte:head>
    <title>My distributions — Zarf Airdrop</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 py-8">
    <header class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-semibold tracking-tight text-zen-fg">My distributions</h1>
            <p class="mt-1 text-sm text-zen-fg-muted">
                Campaigns you've launched from this browser.
            </p>
        </div>
        <ZenButton variant="primary" onclick={() => goto('/wizard/step-0')}>
            <Plus class="mr-1 h-4 w-4" /> New
        </ZenButton>
    </header>

    {#if campaigns.length === 0}
        <ZenCard class="flex flex-col items-center gap-4 p-12 text-center">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-zen-fg/5">
                <Coins class="h-6 w-6 text-zen-fg-muted" />
            </div>
            <p class="text-sm text-zen-fg-muted">No distributions yet.</p>
            <ZenButton variant="primary" onclick={() => goto('/wizard/step-0')}>
                Create your first distribution
            </ZenButton>
        </ZenCard>
    {:else}
        <ul class="space-y-3">
            {#each campaigns as c (c.id)}
                {@const p = progressById[c.id]}
                {@const reTx = reclaimedTx[c.id]}
                <li>
                    <ZenCard class="space-y-3 p-5">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="text-lg font-semibold tabular-nums text-zen-fg">
                                        {formatTokenAmount(BigInt(c.total), c.tokenDecimals)}
                                        <span class="text-xs font-normal text-zen-fg-subtle"
                                            >{c.tokenSymbol ?? 'tokens'}</span
                                        >
                                    </span>
                                    <ZenBadge
                                        variant={c.state === 'launched' ? 'success' : 'default'}
                                    >
                                        {c.state}
                                    </ZenBadge>
                                </div>
                                <p class="mt-0.5 text-xs text-zen-fg-muted">
                                    {c.recipientCount} recipients{#if p}
                                        · <span class="tabular-nums text-zen-fg"
                                            >{p.claimedCount}</span
                                        > claimed{/if}
                                </p>
                                {#if p}
                                    <div
                                        class="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-zen-fg/10"
                                    >
                                        <div
                                            class="h-full rounded-full bg-zen-success"
                                            style="width: {Math.min(
                                                100,
                                                Math.round(p.claimedFraction * 100),
                                            )}%"
                                        ></div>
                                    </div>
                                {/if}
                            </div>
                            <div class="flex flex-col items-end gap-1 text-xs">
                                <span class="inline-flex items-center gap-1 text-zen-fg-muted">
                                    <Clock class="h-3.5 w-3.5" />
                                    {deadlineLabel(c)}
                                </span>
                                <span class="inline-flex items-center gap-1 text-zen-fg-faint">
                                    {#if c.locked}<Lock class="h-3 w-3" /> Locked{:else}<Unlock
                                            class="h-3 w-3"
                                        /> Open{/if}
                                </span>
                            </div>
                        </div>

                        <div
                            class="flex items-center justify-between gap-2 border-t border-zen-border-subtle pt-3"
                        >
                            <a
                                href={getContractExplorerUrl(c.airdropAddress)}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-1 truncate font-mono text-[11px] text-zen-fg-muted hover:text-zen-fg"
                            >
                                {c.airdropAddress.slice(0, 6)}…{c.airdropAddress.slice(-6)}
                                <ExternalLink class="h-3 w-3 shrink-0" />
                            </a>
                            <div class="flex items-center gap-2">
                                <ZenButton variant="ghost" size="sm" onclick={() => copyClaim(c)}>
                                    {#if copiedId === c.id}<Check class="mr-1 h-3.5 w-3.5" /> Copied{:else}<Copy
                                            class="mr-1 h-3.5 w-3.5"
                                        /> Claim link{/if}
                                </ZenButton>
                                <ZenButton
                                    variant="ghost"
                                    size="sm"
                                    loading={reclaimingId === c.id}
                                    disabled={!canReclaim(c) ||
                                        !walletAddr ||
                                        reclaimingId === c.id}
                                    title={!walletAddr
                                        ? 'Connect your wallet to reclaim.'
                                        : reclaimHint(c)}
                                    onclick={() => onReclaim(c)}
                                >
                                    Reclaim
                                </ZenButton>
                            </div>
                        </div>

                        {#if reTx}
                            <p class="text-xs text-zen-success">
                                Reclaimed.
                                <a
                                    href={getExplorerUrl(reTx)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="inline-flex items-center gap-1 hover:underline"
                                >
                                    View transaction <ExternalLink class="h-3 w-3" />
                                </a>
                            </p>
                        {:else if reclaimError && reclaimError.id === c.id}
                            <p class="text-xs text-zen-error">{reclaimError.message}</p>
                        {:else if reclaimHint(c) && !canReclaim(c)}
                            <p class="text-xs text-zen-fg-faint">{reclaimHint(c)}</p>
                        {/if}
                    </ZenCard>
                </li>
            {/each}
        </ul>
    {/if}
</div>
