<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import AppShell from "$lib/components/layout/AppShell.svelte";
    import { LayoutGrid, PlusCircle } from "lucide-svelte";

    let { children } = $props();

    onMount(() => {
        wizardStore.restore();
    });

    // Determine active section from URL
    let isDistributionsView = $derived(
        page.url.pathname.startsWith("/distributions"),
    );
    let isCreateView = $derived(page.url.pathname.startsWith("/wizard"));
</script>

<AppShell>
    {@render children()}
</AppShell>

<!-- Mobile Bottom Nav (Keep for mobile wizard) -->
<nav
    class="lg:hidden fixed bottom-0 inset-x-0 bg-base-100/95 backdrop-blur-lg border-t border-base-content/10 z-50 safe-area-pb"
>
    <div class="flex justify-around h-14">
        <a
            href="/wizard/step-0"
            class="flex flex-col items-center justify-center flex-1 gap-0.5 {isCreateView
                ? 'text-primary'
                : 'text-base-content/40'}"
        >
            <PlusCircle class="w-5 h-5" />
            <span class="text-[10px] font-medium">Create</span>
        </a>
        <a
            href="/distributions"
            class="flex flex-col items-center justify-center flex-1 gap-0.5 {isDistributionsView
                ? 'text-primary'
                : 'text-base-content/40'}"
        >
            <LayoutGrid class="w-5 h-5" />
            <span class="text-[10px] font-medium">Distributions</span>
        </a>
    </div>
</nav>

<style>
    /* Safe area for mobile notch/home indicator */
    .safe-area-pb {
        padding-bottom: env(safe-area-inset-bottom, 0);
    }
</style>
