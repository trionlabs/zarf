<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { extractStateFromUrl } from "$lib/auth/googleAuth";
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";
    import WalletConnectButton from "$lib/components/layout/WalletConnectButton.svelte";
    import Hero from "$lib/components/landing/Hero.svelte";

    onMount(() => {
        // If we land here with a Google ID Token (OAuth callback), forward to /claim
        if (window.location.hash.includes("id_token=")) {
            // Parse state to restore context (e.g. contract address)
            const oauthState = extractStateFromUrl();
            const addressQuery = oauthState?.address
                ? `?address=${oauthState.address}`
                : "";

            // Forward to /claim with token hash and restored address
            goto(`/claim${addressQuery}${window.location.hash}`, {
                replaceState: true,
            });
        }
    });
    const features = [
        {
            title: "🔒 Zero-Knowledge Privacy",
            description:
                "Claim tokens without revealing your email. Built with Noir ZK circuits.",
        },
        {
            title: "✅ No KYC Required",
            description:
                "Privacy-first distribution. Only email verification needed.",
        },
        {
            title: "📅 Built-in Vesting",
            description:
                "Configure cliff periods and vesting schedules. All on-chain.",
        },
    ];
</script>

<svelte:head>
    <title>Zarf - Privacy-Preserving Token Distribution</title>
    <meta
        name="description"
        content="Create token distributions with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs."
    />
</svelte:head>

<div class="min-h-screen flex flex-col relative">
    <!-- Landing Navbar -->
    <header
        class="fixed top-0 w-full z-50 px-6 py-4 flex items-center justify-between backdrop-blur-md bg-base-100/30 border-b border-base-content/5 transition-all duration-300"
    >
        <div
            class="flex items-center gap-3 font-medium text-lg tracking-wide select-none group cursor-default"
        >
            <!-- Zen Logo: Minimal Envelope -->
            <div
                class="relative w-8 h-8 flex items-center justify-center transition-transform group-hover:scale-105"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="w-6 h-6 text-base-content"
                >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <!-- Subtle Glow behind logo -->
                <div
                    class="absolute inset-0 bg-base-content/5 blur-lg rounded-full scale-0 group-hover:scale-150 transition-transform duration-500"
                ></div>
            </div>
            <span class="text-base-content/90">Zarf</span>
        </div>

        <div class="flex items-center gap-4">
            <a
                href="/docs"
                class="link link-hover text-sm font-medium opacity-70 hover:opacity-100 hidden sm:block"
                >Documentation</a
            >
            <div class="hidden sm:block w-px h-4 bg-base-content/20"></div>
            <WalletConnectButton />
            <div class="w-px h-4 bg-base-content/20"></div>
            <ThemeToggle />
        </div>
    </header>
    <!-- Hero Section -->
    <Hero />

    <!-- Features Section -->
    <section class="py-20">
        <div class="container mx-auto px-4">
            <h2 class="text-3xl font-bold text-center mb-12">Why Zarf?</h2>

            <div class="grid md:grid-cols-3 gap-8">
                {#each features as feature}
                    <div class="card shadow-xl">
                        <div class="card-body">
                            <h3 class="card-title">{feature.title}</h3>
                            <p>{feature.description}</p>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer
        class="footer footer-center p-10 bg-base-200 text-base-content mt-auto"
    >
        <nav>
            <div class="grid grid-flow-col gap-4">
                <a href="/wizard" class="link link-hover">Create Distribution</a
                >
                <a href="/claim" class="link link-hover">Claim Tokens</a>
                <a href="/distributions" class="link link-hover"
                    >My Distributions</a
                >
            </div>
        </nav>

        <aside class="flex items-center gap-4">
            <p>© 2025 Zarf - Privacy-First Token Distribution</p>
            <ThemeToggle />
        </aside>
    </footer>
</div>
