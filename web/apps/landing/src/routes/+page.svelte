<script lang="ts">
    import { onMount } from 'svelte';
    import { extractStateFromUrl } from '$lib/utils/oauth';
    import ThemeToggle from '@zarf/ui/components/layout/ThemeToggle.svelte';
    import Tooltip from '@zarf/ui/components/ui/Tooltip.svelte';
    import Hero from '@zarf/ui/components/landing/Hero.svelte';
    import HowItWorks from '@zarf/ui/components/landing/HowItWorks.svelte';
    import Features from '@zarf/ui/components/landing/Features.svelte';
    import UseCases from '@zarf/ui/components/landing/UseCases.svelte';
    import ZarfLogo from '@zarf/ui/components/brand/ZarfLogo.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import { dev } from '@zarf/core/utils/log';

    const DEBUG = import.meta.env.DEV;

    let scrollPosition = $state(0);
    let mounted = $state(false);

    onMount(() => {
        mounted = true;
    });

    onMount(() => {
        const hash = window.location.hash;

        // 1. Handle Successful OAuth Callback
        if (hash.includes('id_token=')) {
            dev('[Landing] Detected ID Token, processing redirect...');

            // Parse state to restore context (e.g. contract address)
            const oauthState = extractStateFromUrl();
            const addressQuery = oauthState?.address ? `?address=${oauthState.address}` : '';

            // Forward to claim subdomain with state and hash
            const target = `https://claim.zarf.to${addressQuery}${hash}`;
            dev('[Landing] Redirecting to:', target);
            window.location.replace(target);
            return;
        }

        // 2. Handle OAuth Errors (e.g. access_denied, interaction_required)
        if (hash.includes('error=')) {
            if (DEBUG) {
                console.warn('[Landing] OAuth Error detected:', hash);
            }

            const oauthState = extractStateFromUrl();

            // Redirect back to claim page with generic error param.
            // We strip the specific error hash to avoid raw error exposure,
            // but add clean query param for Claim app to handle.
            // URL + searchParams handles the empty-address case correctly;
            // the previous template literal emitted `claim.zarf.to&error=…`
            // (missing query separator) when no address was preserved.
            const redirect = new URL('https://claim.zarf.to');
            if (oauthState?.address) {
                redirect.searchParams.set('address', oauthState.address);
            }
            redirect.searchParams.set('error', 'auth_failed');
            window.location.replace(redirect.toString());
            return;
        }
    });
</script>

<svelte:head>
    <title>zarf.to - Privacy-Preserving Token Distribution on Stellar</title>
    <meta
        name="description"
        content="Create private token distributions and payroll on Stellar with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs."
    />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Zarf" />
    <meta property="og:url" content="https://zarf.to/" />
    <meta property="og:title" content="Zarf — Privacy-Preserving Token Distribution" />
    <meta
        property="og:description"
        content="Create private token distributions and payroll on Stellar with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs."
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
        content="Create private token distributions and payroll on Stellar with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs."
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
            <a href="https://docs.zarf.to" aria-label="Zarf documentation" class="inline-block">
                <ZenButton
                    variant="ghost"
                    size="sm"
                    aria-label="Zarf documentation"
                    class="rounded-full bg-base-content/5 text-base-content/70 border border-base-content/8 hover:text-base-content hover:bg-base-content/10 !ring-0 px-4 py-1.5"
                >
                    Docs
                </ZenButton>
            </a>

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
                        href="https://docs.zarf.to"
                        class="hover:text-base-content/70 transition-colors duration-300"
                    >
                        Docs
                    </a>
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
                    <span>Built on</span>
                    <a
                        href="https://stellar.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-zen-fg-muted hover:text-base-content/60 transition-colors duration-300 inline-flex items-center gap-1"
                    >
                        <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                d="M12.003 1.716c-1.37 0-2.7.27-3.948.78A10.18 10.18 0 0 0 2.66 7.901a10.136 10.136 0 0 0-.797 3.954c0 .258.01.516.027.775a1.942 1.942 0 0 1-1.055 1.88L0 14.934v1.902l2.463-1.26.072-.032v.005l.77-.39.758-.385.066-.039 14.807-7.56 1.666-.847 3.392-1.732V2.694L17.792 5.86 3.744 13.025l-.104.055-.017-.115a8.286 8.286 0 0 1-.071-1.105c0-2.255.88-4.377 2.474-5.977a8.462 8.462 0 0 1 2.71-1.82 8.513 8.513 0 0 1 3.2-.654h.067a8.41 8.41 0 0 1 4.09 1.055l1.628-.83.126-.066a10.11 10.11 0 0 0-5.845-1.853zM24 7.143 5.047 16.808l-1.666.847L0 19.382v1.902l3.282-1.671 2.91-1.485 14.058-7.153.105-.055.016.115c.05.369.072.743.072 1.11 0 2.255-.88 4.383-2.475 5.978a8.461 8.461 0 0 1-2.71 1.82 8.305 8.305 0 0 1-3.2.654h-.06c-1.441 0-2.86-.369-4.102-1.061l-.066.033-1.683.857c.594.418 1.232.776 1.903 1.062a10.11 10.11 0 0 0 3.947.797 10.09 10.09 0 0 0 7.17-2.975 10.136 10.136 0 0 0 2.969-7.18c0-.259-.005-.523-.027-.781a1.942 1.942 0 0 1 1.055-1.88L24 9.044z"
                            ></path>
                        </svg>
                        Stellar</a
                    >
                    <span>by</span>
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
