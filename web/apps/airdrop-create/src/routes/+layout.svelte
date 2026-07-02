<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { page } from '$app/state';
    import { LayoutGrid, PlusCircle } from 'lucide-svelte';
    import AppShell from '@zarf/ui/components/layout/AppShell.svelte';
    import WalletSelectionModal from '@zarf/ui/components/wallet/WalletSelectionModal.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { themeStore } from '@zarf/ui/stores/themeStore.svelte';
    import { campaignStore } from '$lib/stores/campaignStore.svelte';

    let { children } = $props();

    // Wallet-only: NO authStore / Google / PIN — an airdrop campaign needs a
    // wallet, never an email identity.

    // Restore the draft during layout INIT, not onMount: children mount before
    // their parent, so on a step-1 reload the page's persist $effect would run
    // first and overwrite the saved draft with the empty initial state before
    // an onMount restore ever read it.
    if (browser) {
        campaignStore.restore();
    }

    onMount(() => {
        if (browser) {
            themeStore.restore();
            networkStore.restore();
            walletStore.init();
        }
        return () => walletStore.destroy();
    });

    let isDistributionsView = $derived(page.url.pathname.startsWith('/distributions'));
    let isCreateView = $derived(page.url.pathname.startsWith('/wizard'));
</script>

<a href="#main" class="skip-link">Skip to content</a>

<div class="ripple-bg"></div>

{#if walletStore.error}
    <div class="fixed top-4 right-4 z-[100] max-w-sm animate-zen-slide-down">
        <ZenAlert variant="error" dismissible ondismiss={() => walletStore.clearError()}>
            {walletStore.error}
        </ZenAlert>
    </div>
{/if}

<WalletSelectionModal />

<AppShell showWallet rootClass="selection:bg-zen-primary-muted selection:text-zen-fg">
    {#snippet nav()}
        <a
            href="/wizard/step-0"
            class="text-xs font-medium transition-colors hover:text-zen-fg {isCreateView
                ? 'text-zen-fg'
                : 'text-zen-fg-muted'}"
        >
            Create
        </a>
        <a
            href="/distributions"
            class="text-xs font-medium transition-colors hover:text-zen-fg {isDistributionsView
                ? 'text-zen-fg'
                : 'text-zen-fg-muted'}"
        >
            Distributions
        </a>
    {/snippet}
    {@render children()}
</AppShell>

<nav
    class="lg:hidden fixed bottom-0 inset-x-0 bg-zen-bg/95 backdrop-blur-lg border-t-[0.5px] border-zen-border-subtle z-50 safe-area-pb"
>
    <div class="flex justify-around h-14">
        <a
            href="/wizard/step-0"
            class="flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors {isCreateView
                ? 'text-zen-fg'
                : 'text-zen-fg-faint'}"
        >
            <PlusCircle class="w-5 h-5" />
            <span class="text-[10px] font-medium">Create</span>
        </a>
        <a
            href="/distributions"
            class="flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors {isDistributionsView
                ? 'text-zen-fg'
                : 'text-zen-fg-faint'}"
        >
            <LayoutGrid class="w-5 h-5" />
            <span class="text-[10px] font-medium">Distributions</span>
        </a>
    </div>
</nav>

<style>
    .safe-area-pb {
        padding-bottom: env(safe-area-inset-bottom, 0);
    }
</style>
