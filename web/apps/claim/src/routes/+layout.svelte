<script lang="ts">
    import '../app.css';
    import AppShell from '@zarf/ui/components/layout/AppShell.svelte';
    import { page } from '$app/state';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { authStore } from '@zarf/ui/stores/authStore.svelte';
    import { themeStore } from '@zarf/ui/stores/themeStore.svelte';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import WalletSelectionModal from '@zarf/ui/components/wallet/WalletSelectionModal.svelte';
    import ToastContainer from '@zarf/ui/components/ui/ToastContainer.svelte';

    let { children } = $props();

    onMount(() => {
        if (browser) {
            themeStore.restore();
            networkStore.restore();
            walletStore.init();
            authStore.restoreGmailSession(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '');
        }
        return () => walletStore.destroy();
    });
</script>

<a href="#main" class="skip-link">Skip to content</a>

<!-- Subtle ripple background texture -->
<div class="ripple-bg"></div>

<WalletSelectionModal />
<ToastContainer />

<AppShell
    showEmail
    showWalletBadge
    rootClass="bg-zen-bg selection:bg-zen-primary selection:text-zen-primary-content"
    containerClass="w-full max-w-7xl mx-auto p-8 lg:p-12"
>
    {#snippet nav()}
        <a
            href="/"
            class="text-xs font-medium transition-colors hover:text-zen-fg {page.url.pathname ===
            '/'
                ? 'text-zen-fg'
                : 'text-zen-fg-muted'}"
        >
            Claim
        </a>
    {/snippet}
    {@render children()}
</AppShell>
