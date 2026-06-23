<script lang="ts">
    import { onMount } from 'svelte';
    import ThemeToggle from '@zarf/ui/components/layout/ThemeToggle.svelte';
    import Tooltip from '@zarf/ui/components/ui/Tooltip.svelte';
    import Hero from '@zarf/ui/components/landing/Hero.svelte';
    import HowItWorks from '@zarf/ui/components/landing/HowItWorks.svelte';
    import Features from '@zarf/ui/components/landing/Features.svelte';
    import UseCases from '@zarf/ui/components/landing/UseCases.svelte';
    import ZarfLogo from '@zarf/ui/components/brand/ZarfLogo.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';

    // NOTE: this shell (zarf.to) deliberately does NOT read or forward the OAuth
    // id_token. OAuth's redirect_uri is `${window.location.origin}/`, so the
    // callback returns to the initiating origin (claim.zarf.to), which handles
    // its own #id_token via extractTokenFromUrl. A legacy callback relay used to
    // live here and forward the raw JWT fragment to claim.zarf.to; it never fired
    // (no flow sets redirect_uri to zarf.to) and made the "shell never touches
    // the JWT" audit-scope guarantee false in code. Removed — keep it that way.

    let scrollPosition = $state(0);
    let mounted = $state(false);

    onMount(() => {
        mounted = true;
    });
</script>

<svelte:head>
    <title>zarf.to - Privacy-Preserving Token Distribution</title>
    <meta
        name="description"
        content="Create private token distributions and payroll with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs."
    />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Zarf" />
    <meta property="og:url" content="https://zarf.to/" />
    <meta property="og:title" content="Zarf — Privacy-Preserving Token Distribution" />
    <meta
        property="og:description"
        content="Create private token distributions and payroll with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs."
    />
    <meta property="og:image" content="https://zarf.to/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Zarf — E-Mail First Confidential Token Distributions" />

    <!-- Twitter card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="https://zarf.to/" />
    <meta name="twitter:title" content="Zarf — Privacy-Preserving Token Distribution" />
    <meta
        name="twitter:description"
        content="Create private token distributions and payroll with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs."
    />
    <meta name="twitter:image" content="https://zarf.to/og.png" />
</svelte:head>

<svelte:window bind:scrollY={scrollPosition} />

<div class="min-h-screen flex flex-col relative font-sans selection:bg-primary/20">
    <!-- GLOBAL BACKGROUND: Fixed dark void behind everything to prevent grain artifacts -->
    <div class="fixed inset-0 bg-base-100 -z-10"></div>

    <!-- GLOBAL GRAIN OVERLAY: Fixed & Unified for Premium Texture -->
    <!-- Uses CSS-only theme detection to avoid hydration flash -->
    <div class="landing-grain fixed inset-0 pointer-events-none z-[25]"></div>
    <!-- Landing Navbar -->
    <header
        class="sticky top-0 w-full z-50 px-6 py-4 flex items-center justify-between transition-all duration-500 {mounted &&
        scrollPosition > 20
            ? 'backdrop-blur-xl bg-base-100/70 border-b border-base-content/5'
            : 'backdrop-blur-none bg-transparent border-transparent'}"
    >
        <button
            type="button"
            class="flex items-center gap-2.5 group cursor-pointer bg-transparent border-none p-0"
            onclick={() => window.scrollTo(0, 0)}
        >
            <!-- Minimal Logo -->
            <ZarfLogo size="lg" />
        </button>

        <div class="flex items-center gap-3">
            <a
                href="https://x.com/trionlabs"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow Zarf on X"
                class="inline-block"
            >
                <ZenButton
                    variant="ghost"
                    size="sm"
                    aria-label="Follow Zarf on X"
                    class="rounded-full bg-base-content/5 text-base-content/70 border border-base-content/8 hover:text-base-content hover:bg-base-content/10 !ring-0 px-4 py-1.5"
                >
                    {#snippet iconLeft()}
                        <svg
                            class="w-3.5 h-3.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                            ></path>
                        </svg>
                    {/snippet}
                    <span class="hidden sm:inline">Follow</span>
                </ZenButton>
            </a>

            <div class="hidden sm:block w-px h-5 bg-base-content/8"></div>
            <ThemeToggle />
        </div>
    </header>

    <!-- Content Wrapper: Lifts all interactive sections above the grain (z-25) -->
    <div class="relative z-30">
        <!-- Hero Section -->
        <Hero />

        <!-- How It Works (Sticky Flow) -->
        <HowItWorks />

        <!-- Features (Bento Grid) -->
        <Features />

        <!-- Use Cases (Tabbed) -->
        <UseCases />

        <!-- Final CTA -->
        <section class="py-24 relative overflow-hidden">
            <div class="container mx-auto px-6 max-w-2xl text-center">
                <p class="text-xs font-medium tracking-[0.2em] uppercase text-zen-fg-muted mb-4">
                    Stay Updated
                </p>
                <h2
                    class="text-3xl md:text-4xl font-semibold mb-5 tracking-tight text-base-content"
                >
                    Join the Waitlist
                </h2>
                <p class="text-base text-zen-fg-muted mb-10 max-w-md mx-auto leading-relaxed">
                    Be the first to know when zarf.to launches. Follow us for exclusive updates and
                    early access.
                </p>
                <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <a
                        href="https://x.com/trionlabs"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-block"
                    >
                        <ZenButton
                            variant="primary"
                            size="lg"
                            class="rounded-full !bg-base-content !text-base-100 hover:shadow-lg hover:shadow-base-content/10 w-full sm:w-auto"
                        >
                            {#snippet iconLeft()}
                                <svg
                                    class="w-4 h-4"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <path
                                        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                                    ></path>
                                </svg>
                            {/snippet}
                            Follow on X
                        </ZenButton>
                    </a>
                    <Tooltip text="Coming Soon" position="top">
                        <ZenButton
                            variant="secondary"
                            size="lg"
                            disabled
                            class="rounded-full !bg-transparent !text-base-content/35 !border-base-content/10 cursor-not-allowed"
                        >
                            View on GitHub
                        </ZenButton>
                    </Tooltip>
                </div>
            </div>

            <!-- Background Glow - more subtle -->
            <div
                class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[200px] bg-gradient-to-t from-base-content/3 to-transparent blur-[80px] -z-10"
            ></div>
        </section>
    </div>

    <!-- Footer -->
    <footer class="relative mt-auto border-t border-base-content/5 overflow-hidden">
        <div class="container mx-auto px-6 py-10 relative z-10">
            <div class="flex flex-col md:flex-row justify-between items-center gap-5">
                <div
                    class="flex items-center gap-2 text-zen-fg-muted hover:text-base-content/60 transition-colors duration-300"
                >
                    <ZarfLogo size="sm" />
                </div>

                <div class="flex gap-6 text-xs font-medium text-zen-fg-muted">
                    <a
                        href="https://x.com/trionlabs"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Zarf on X"
                        class="hover:text-base-content/70 transition-colors duration-300 flex items-center gap-1.5"
                    >
                        <svg
                            class="w-3 h-3"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                            ></path>
                        </svg>
                        X
                    </a>
                    <span class="text-zen-fg-muted cursor-not-allowed">GitHub</span>
                </div>

                <div class="text-xs text-zen-fg-muted flex items-center gap-1.5">
                    <span>© 2026</span>
                    <span class="text-base-content/20">·</span>
                    <span>Built by</span>
                    <a
                        href="https://trionlabs.dev"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-zen-fg-muted hover:text-base-content/60 transition-colors duration-300"
                        >trionlabs.dev</a
                    >
                </div>
            </div>
        </div>
    </footer>
</div>
