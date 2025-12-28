<script lang="ts">
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";
    import WalletConnectButton from "$lib/components/layout/WalletConnectButton.svelte";

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
        class="absolute top-0 w-full z-50 px-6 py-4 flex items-center justify-between"
    >
        <div class="flex items-center gap-2 font-bold text-xl">
            <div
                class="w-8 h-8 rounded bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-content"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    class="w-5 h-5 stroke-current"
                    stroke-width="2.5"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                </svg>
            </div>
            Zarf
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
    <section class="hero min-h-screen bg-base-200">
        <div class="hero-content text-center">
            <div class="max-w-2xl">
                <h1 class="text-5xl font-bold">
                    Privacy-Preserving Token Distribution
                </h1>
                <p class="py-6 text-xl">
                    Create vesting schedules and enable private token claims
                    using Zero-Knowledge proofs. No KYC. No compromises.
                </p>

                <div class="flex gap-4 justify-center flex-wrap">
                    <a href="/wizard" class="btn btn-primary btn-lg">
                        Create Distribution
                    </a>
                    <a href="/claim" class="btn btn-secondary btn-lg">
                        Claim Tokens
                    </a>
                </div>

                <div class="mt-8">
                    <div class="badge badge-outline">
                        Powered by Noir & Aztec
                    </div>
                    <div class="badge badge-outline ml-2">
                        Deployed on Ethereum
                    </div>
                </div>
            </div>
        </div>
    </section>

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
