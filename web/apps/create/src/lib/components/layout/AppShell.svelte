<script lang="ts">
    import ZarfNavbar from "@zarf/ui/components/layout/ZarfNavbar.svelte";
    import { page } from "$app/state";

    let { children } = $props();
</script>

<div
    class="min-h-screen font-sans selection:bg-zen-primary-muted selection:text-zen-fg"
>
    <!-- Common Shared Navbar -->
    <ZarfNavbar showWallet={true}>
        <a
            href="/wizard/step-0"
            class="text-xs font-medium transition-colors hover:text-zen-fg {page.url.pathname.startsWith(
                '/wizard',
            )
                ? 'text-zen-fg'
                : 'text-zen-fg-muted'}"
        >
            Create
        </a>
        <a
            href="/distributions"
            class="text-xs font-medium transition-colors hover:text-zen-fg {page.url.pathname.startsWith(
                '/distributions',
            )
                ? 'text-zen-fg'
                : 'text-zen-fg-muted'}"
        >
            Distributions
        </a>
    </ZarfNavbar>

    <!-- Main Content Area -->
    <main class="w-full">
        <!-- Inner Container with subtle inset feel (Zen Pro) -->
        <div class="h-full">
            <div class="w-full p-6 lg:p-8">
                {@render children()}
            </div>
        </div>
    </main>
</div>
