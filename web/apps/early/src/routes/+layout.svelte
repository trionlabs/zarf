<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { themeStore } from '@zarf/ui/stores/themeStore.svelte';
    import ZarfLogo from '@zarf/ui/components/brand/ZarfLogo.svelte';
    import ThemeToggle from '@zarf/ui/components/layout/ThemeToggle.svelte';

    let { children } = $props();

    let scrollY = $state(0);
    let mounted = $state(false);

    onMount(() => {
        themeStore.restore();
        mounted = true;
    });
</script>

<svelte:window bind:scrollY />

<a
    href="#main"
    class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-base-100 focus:px-4 focus:py-2 focus:text-base-content"
>
    Skip to content
</a>

<div class="relative flex min-h-screen flex-col font-sans selection:bg-primary/20">
    <!-- Global dark void behind everything (prevents grain artifacts) -->
    <div class="fixed inset-0 -z-10 bg-base-100"></div>
    <!-- Unified film-grain overlay (CSS-only theme detection, no hydration flash) -->
    <div class="landing-grain pointer-events-none fixed inset-0 z-[25]"></div>

    <header
        class="sticky top-0 z-50 flex w-full items-center justify-between px-6 py-4 transition-all duration-500 {mounted &&
        scrollY > 20
            ? 'border-b border-base-content/5 bg-base-100/70 backdrop-blur-xl'
            : 'border-transparent bg-transparent backdrop-blur-none'}"
    >
        <a href="/" class="flex items-center gap-2.5" aria-label="Zarf early access — home">
            <ZarfLogo size="lg" />
        </a>
        <div class="flex items-center gap-3">
            <a
                href="https://docs.zarf.to"
                class="px-1.5 text-xs font-medium tracking-wide text-base-content/60 transition-colors duration-300 hover:text-base-content"
            >
                Docs
            </a>
            <a
                href="https://zarf.to"
                class="px-1.5 text-xs font-medium tracking-wide text-base-content/60 transition-colors duration-300 hover:text-base-content"
            >
                Main site
            </a>
            <ThemeToggle />
        </div>
    </header>

    <main id="main" tabindex="-1" class="flex-1">
        {@render children()}
    </main>

    <footer
        class="relative z-10 mt-auto flex flex-col items-center justify-between gap-3 border-t border-base-content/5 px-6 py-8 text-xs text-base-content/50 sm:flex-row"
    >
        <span>© Zarf — private ZK airdrops on Stellar.</span>
        <nav class="flex items-center gap-4">
            <a href="/privacy" class="transition-colors hover:text-base-content">Privacy</a>
            <a href="/terms-and-conditions" class="transition-colors hover:text-base-content">Terms</a>
            <a href="https://x.com/zarfto" class="transition-colors hover:text-base-content">@zarfto</a>
        </nav>
    </footer>
</div>
