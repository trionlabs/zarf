<script lang="ts">
    import { goto } from '$app/navigation';
    import { Plus, ExternalLink, Lock, Unlock, Clock, Copy, Check, Coins } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenBadge from '@zarf/ui/components/ui/ZenBadge.svelte';
    import { getContractExplorerUrl } from '@zarf/core/contracts/explorer';
    import { formatTokenAmount } from '@zarf/core/utils/amount';
    import { campaignStore } from '$lib/stores/campaignStore.svelte';
    import type { Campaign } from '$lib/stores/types';

    const campaigns = $derived(campaignStore.campaigns);
    const nowSec = Math.floor(Date.now() / 1000);

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
    let reclaimNoteId = $state<string | null>(null);

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
    function onReclaim(c: Campaign) {
        // The on-chain reclaim is wired with the claim release (M5/M6).
        reclaimNoteId = c.id;
        setTimeout(() => (reclaimNoteId = null), 4000);
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
                                    {c.recipientCount} recipients
                                </p>
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
                                    disabled={!canReclaim(c)}
                                    title={reclaimHint(c)}
                                    onclick={() => onReclaim(c)}
                                >
                                    Reclaim
                                </ZenButton>
                            </div>
                        </div>

                        {#if reclaimNoteId === c.id}
                            <p class="text-xs text-zen-fg-muted">
                                On-chain reclaim ships with the claim release.
                            </p>
                        {:else if reclaimHint(c) && !canReclaim(c)}
                            <p class="text-xs text-zen-fg-faint">{reclaimHint(c)}</p>
                        {/if}
                    </ZenCard>
                </li>
            {/each}
        </ul>
    {/if}
</div>
