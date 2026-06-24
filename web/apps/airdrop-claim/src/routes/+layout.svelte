<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import AppShell from '@zarf/ui/components/layout/AppShell.svelte';
    import WalletSelectionModal from '@zarf/ui/components/wallet/WalletSelectionModal.svelte';
    import ToastContainer from '@zarf/ui/components/ui/ToastContainer.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { themeStore } from '@zarf/ui/stores/themeStore.svelte';

    let { children } = $props();

    // Wallet-only identity: NO authStore / Google / PIN. A claimant proves
    // ownership by signing with their wallet, never an email — the one concrete
    // difference from the vesting claim layout.
    onMount(() => {
        if (browser) {
            themeStore.restore();
            networkStore.restore();
            walletStore.init();
        }
        return () => walletStore.destroy();
    });
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
<ToastContainer />

<AppShell
    showWallet
    rootClass="bg-zen-bg selection:bg-zen-primary-muted selection:text-zen-fg"
    containerClass="w-full max-w-3xl mx-auto p-6 lg:p-10"
>
    {#snippet nav()}
        <span class="text-xs font-medium text-zen-fg">Claim</span>
    {/snippet}
    {@render children()}
</AppShell>
