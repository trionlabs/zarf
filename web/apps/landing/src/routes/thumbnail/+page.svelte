<script lang="ts">
    import { onMount } from "svelte";
    import ZarfLogo from "@zarf/ui/components/brand/ZarfLogo.svelte";

    let mounted = $state(false);
    let container: HTMLDivElement;

    // Fixed spotlight position for the static effect (Center-Right to balance text)
    let mouse = { x: 800, y: 250 };

    onMount(() => {
        mounted = true;
        if (container) container.setAttribute("data-theme", "dark");
    });
</script>

<div
    bind:this={container}
    class="relative w-full h-screen min-h-[500px] flex flex-col justify-between bg-[#050505] font-sans selection:bg-white/20 p-20 overflow-hidden"
    style="--mouse-x: {mouse.x}px; --mouse-y: {mouse.y}px;"
>
    <!-- Background Texture -->
    <div
        class="fixed inset-0 pointer-events-none z-0"
        style="
            background-image: url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E&quot;);
            opacity: 0.12;
            mix-blend-mode: overlay;
        "
    ></div>

    <!-- SPOTLIGHT EFFECT -->
    <div
        class="absolute inset-0 pointer-events-none z-10 wave-grid-spotlight opacity-50"
    ></div>

    <!-- 1. HEADER: BRANDING -->
    <div
        class="z-50 {mounted
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2'} transition-all duration-1000"
    >
        <div
            class="flex items-center gap-3 opacity-100 origin-top-left scale-125"
        >
            <ZarfLogo size="lg" />
        </div>
    </div>

    <!-- 2. MAIN CONTENT (Restored to "Like the Attachment") -->
    <div
        class="absolute top-1/2 left-20 right-20 -translate-y-1/2 z-30 pointer-events-none"
    >
        <div class="max-w-4xl">
            <!-- Overline -->
            <h2
                class="text-sm font-medium text-white/40 tracking-[0.2em] uppercase mb-6"
                style="font-family: 'Inter', sans-serif;"
            >
                <span
                    class="block {mounted
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-2'} transition-all duration-1000 delay-100"
                >
                    Private & Programmable
                </span>
            </h2>

            <!-- Headline: Restored scale and layout, updated text -->
            <h1
                class="text-[4rem] leading-[1.1] font-medium text-white tracking-[-0.03em]"
                style="font-family: 'Saira', sans-serif;"
            >
                <span
                    class="block {mounted
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-4'} transition-all duration-1000 delay-200"
                >
                    Email-First Token Distributions
                </span>
                <span
                    class="block text-white/40 {mounted
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-4'} transition-all duration-1000 delay-300"
                >
                    on the Stellar Network.
                </span>
            </h1>
        </div>
    </div>

    <!-- 3. FOOTER: DETAILS -->
    <div
        class="z-40 flex items-end justify-between {mounted
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2'} transition-all duration-1000 delay-500"
    >
        <!-- Platform Badge -->
        <div class="flex items-center gap-3 opacity-60">
            <span
                class="text-xs font-semibold text-white/50 uppercase tracking-widest"
                >Powered by</span
            >
            <div class="h-px w-8 bg-white/20"></div>
            <div class="flex items-center gap-2">
                <img
                    src="/stellar-xlm-logo.svg"
                    alt="Stellar"
                    class="h-4 w-4"
                    style="filter: invert(1);"
                />
                <span
                    class="text-xs font-bold text-white tracking-widest uppercase"
                    >Stellar</span
                >
            </div>
        </div>

        <!-- Decorative Element -->
        <div class="w-24 h-px bg-white/10"></div>
    </div>
</div>

<style>
    .wave-grid-spotlight {
        background-image: repeating-radial-gradient(
            circle at 0% 100%,
            transparent 0,
            transparent 50px,
            rgba(255, 255, 255, 0.05) 50px,
            rgba(255, 255, 255, 0.08) 52px,
            transparent 52px
        );
        background-size: 150% 150%;
        mask-image: radial-gradient(
            circle 1000px at var(--mouse-x) var(--mouse-y),
            black 0%,
            transparent 60%
        );
        -webkit-mask-image: radial-gradient(
            circle 1000px at var(--mouse-x) var(--mouse-y),
            black 0%,
            transparent 60%
        );
    }

    :global(body) {
        margin: 0;
        padding: 0;
        background: #050505;
    }
</style>
