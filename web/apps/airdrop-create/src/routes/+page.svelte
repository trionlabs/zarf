<script lang="ts">
    import { goto } from '$app/navigation';
    import { ArrowRight, LayoutGrid, Coins } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import { campaignStore } from '$lib/stores/campaignStore.svelte';

    const campaignCount = $derived(campaignStore.campaigns.length);
</script>

<div
    class="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center"
>
    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-zen-fg/5">
        <Coins class="h-7 w-7 text-zen-fg" />
    </div>
    <div class="space-y-3">
        <h1 class="text-3xl font-semibold tracking-tight text-zen-fg sm:text-4xl">
            Distribute tokens to a list of wallets
        </h1>
        <p class="mx-auto max-w-md text-sm text-zen-fg-muted">
            Pick a token, paste your recipients, and publish a claimable distribution. Each wallet
            claims its share — no per-recipient transactions, no spreadsheets to chase.
        </p>
    </div>
    <div class="flex flex-wrap items-center justify-center gap-3">
        <ZenButton variant="primary" onclick={() => goto('/wizard/step-0')}>
            Create a distribution <ArrowRight class="ml-1 h-4 w-4" />
        </ZenButton>
        {#if campaignCount > 0}
            <ZenButton variant="ghost" onclick={() => goto('/distributions')}>
                <LayoutGrid class="mr-1 h-4 w-4" /> My distributions ({campaignCount})
            </ZenButton>
        {/if}
    </div>
</div>
