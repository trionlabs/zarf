<script lang="ts">
    import ZarfNavbar from "@zarf/ui/components/layout/ZarfNavbar.svelte";
    import { page } from "$app/state";

    let { children } = $props();
</script>

<div
    class="min-h-screen bg-zen-bg font-sans selection:bg-zen-primary selection:text-zen-primary-content"
>
    <!-- Common Shared Navbar -->
    <ZarfNavbar showEmail={true} showWalletBadge={true}>
        <a
            href="/"
            class="text-xs font-medium transition-colors hover:text-zen-fg {page.url.pathname === '/'
                ? 'text-zen-fg'
                : 'text-zen-fg-muted'}"
        >
            Claim
        </a>
    </ZarfNavbar>

    <!-- Main Content Area -->
    <main class="min-h-[calc(100vh-4rem)]">
        <div class="w-full max-w-7xl mx-auto p-8 lg:p-12">
            {@render children()}
        </div>
    </main>
</div>
