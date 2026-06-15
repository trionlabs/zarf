<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { browser } from '$app/environment';
    import { fly } from 'svelte/transition';
    import { Check, Copy, LayoutGrid, Plus, ExternalLink } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import { getContractExplorerUrl } from '@zarf/core/contracts/explorer';
    import { warn } from '@zarf/core/utils/log';
    import { campaignStore } from '$lib/stores/campaignStore.svelte';

    let airdrop = $state('');
    let cid = $state('');
    let copied = $state(false);
    let qrDataUrl = $state<string | null>(null);

    const origin = browser ? window.location.origin : '';
    const claimBase = (import.meta.env.VITE_AIRDROP_CLAIM_URL ?? '').replace(/\/+$/, '') || origin;
    const claimUrl = $derived(
        airdrop && cid
            ? `${claimBase}/?a=${encodeURIComponent(airdrop)}&cid=${encodeURIComponent(cid)}`
            : '',
    );

    onMount(() => {
        // Prefer the query (?a=&cid=) the deploy step passes; fall back to the
        // most recent campaign. A bare visit with neither → the dashboard.
        const recent = campaignStore.campaigns[0];
        airdrop = page.url.searchParams.get('a') || recent?.airdropAddress || '';
        cid = page.url.searchParams.get('cid') || recent?.metadataCid || '';
        if (!airdrop || !cid) goto('/distributions');
    });

    // Render the QR client-side only; the link works regardless of QR success.
    $effect(() => {
        const url = claimUrl;
        if (!url) return;
        let cancelled = false;
        (async () => {
            try {
                const QRCode = (await import('qrcode')).default;
                const data = await QRCode.toDataURL(url, { margin: 1, width: 240 });
                if (!cancelled) qrDataUrl = data;
            } catch (e) {
                warn('[done] QR generation failed', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    });

    function copyLink() {
        if (!claimUrl) return;
        navigator.clipboard.writeText(claimUrl);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }
</script>

<svelte:head>
    <title>Distribution live — Zarf Airdrop</title>
</svelte:head>

<div class="mx-auto flex max-w-xl flex-col items-center gap-8 py-12 text-center">
    <div
        class="flex h-16 w-16 items-center justify-center rounded-full bg-zen-success/10 text-zen-success"
        in:fly={{ y: 16, duration: 500 }}
    >
        <Check class="h-8 w-8" />
    </div>

    <div in:fly={{ y: 16, duration: 500, delay: 80 }}>
        <h1 class="text-2xl font-semibold tracking-tight text-zen-fg">Your distribution is live</h1>
        <p class="mt-2 text-sm text-zen-fg-muted">
            Share this link. Each recipient connects their wallet and claims their share.
        </p>
    </div>

    <!-- QR hero -->
    {#if qrDataUrl}
        <div
            class="rounded-2xl border border-zen-border-subtle bg-white p-4"
            in:fly={{ y: 16, duration: 500, delay: 160 }}
        >
            <img
                src={qrDataUrl}
                alt="Claim link QR code"
                width="200"
                height="200"
                class="h-48 w-48"
            />
        </div>
    {:else}
        <div class="h-56 w-56 animate-pulse rounded-2xl bg-zen-fg/5"></div>
    {/if}

    <!-- Shareable link -->
    <div class="w-full" in:fly={{ y: 16, duration: 500, delay: 240 }}>
        <div
            class="flex items-center gap-2 rounded-xl border border-zen-border-subtle bg-zen-bg p-2"
        >
            <span class="flex-1 truncate px-2 font-mono text-xs text-zen-fg" title={claimUrl}
                >{claimUrl}</span
            >
            <ZenButton variant={copied ? 'ghost' : 'primary'} size="sm" onclick={copyLink}>
                {#if copied}<Check class="mr-1 h-4 w-4" /> Copied{:else}<Copy
                        class="mr-1 h-4 w-4"
                    /> Copy{/if}
            </ZenButton>
        </div>
        {#if airdrop}
            <a
                href={getContractExplorerUrl(airdrop)}
                target="_blank"
                rel="noopener noreferrer"
                class="mt-2 inline-flex items-center gap-1 text-xs text-zen-fg-muted hover:text-zen-fg"
            >
                View contract on explorer <ExternalLink class="h-3 w-3" />
            </a>
        {/if}
    </div>

    <!-- Actions -->
    <div
        class="flex flex-wrap items-center justify-center gap-3"
        in:fly={{ y: 16, duration: 500, delay: 320 }}
    >
        <ZenButton variant="primary" onclick={() => goto('/distributions')}>
            <LayoutGrid class="mr-1 h-4 w-4" /> My distributions
        </ZenButton>
        <ZenButton variant="ghost" onclick={() => goto('/wizard/step-0')}>
            <Plus class="mr-1 h-4 w-4" /> Create another
        </ZenButton>
    </div>
</div>
