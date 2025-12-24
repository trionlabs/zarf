<script lang="ts">
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";

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

<div class="min-h-screen flex flex-col">
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
