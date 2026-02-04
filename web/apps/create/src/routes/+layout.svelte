<script lang="ts">
    import "../app.css";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import { authStore } from "@zarf/ui/stores/authStore.svelte";
    import { themeStore } from "@zarf/ui/stores/themeStore.svelte";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { page } from "$app/state";
    import AppShell from "$lib/components/layout/AppShell.svelte";
    import { LayoutGrid, PlusCircle, X } from "lucide-svelte";
    import WalletSelectionModal from "@zarf/ui/components/wallet/WalletSelectionModal.svelte";
    import ZenAlert from "@zarf/ui/components/ui/ZenAlert.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    let { children } = $props();

    onMount(() => {
        if (browser) {
            wizardStore.restore();
            themeStore.restore();
            walletStore.init();
            authStore.restoreGmailSession();
        }
        return () => walletStore.destroy();
    });

    // Determine active section from URL
    let isDistributionsView = $derived(
        page.url.pathname.startsWith("/distributions"),
    );
    let isCreateView = $derived(page.url.pathname.startsWith("/wizard"));
</script>

<!-- Subtle ripple background texture -->
<div class="ripple-bg"></div>

<!-- Global Error Toast for Wallet -->
{#if walletStore.error}
    <div class="fixed top-4 right-4 z-[100] max-w-sm animate-zen-slide-down">
        <ZenAlert variant="error" dismissible ondismiss={() => walletStore.clearError()}>
            {walletStore.error}
        </ZenAlert>
    </div>
{/if}

<WalletSelectionModal />

<AppShell>
    {@render children()}
</AppShell>

<!-- Mobile Bottom Nav -->
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
