<script lang="ts">
    import "../app.css";
    import AppShell from "$lib/components/layout/AppShell.svelte";
    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import { authStore } from "@zarf/ui/stores/authStore.svelte";
    import { themeStore } from "@zarf/ui/stores/themeStore.svelte";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import WalletSelectionModal from "@zarf/ui/components/wallet/WalletSelectionModal.svelte";
    import ToastContainer from "@zarf/ui/components/ui/ToastContainer.svelte";

    let { children } = $props();

    onMount(() => {
        if (browser) {
            themeStore.restore();
            walletStore.init();
            authStore.restoreGmailSession();
        }
        return () => walletStore.destroy();
    });
</script>

<!-- Subtle ripple background texture -->
<div class="ripple-bg"></div>

<WalletSelectionModal />
<ToastContainer />

<AppShell>
    {@render children()}
</AppShell>
