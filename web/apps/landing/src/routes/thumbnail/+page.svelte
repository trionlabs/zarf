<script lang="ts">
    import { onMount } from 'svelte';
    import ZarfLogo from '@zarf/ui/components/brand/ZarfLogo.svelte';

    let mounted = $state(false);
    let container: HTMLDivElement;

    // Fixed spotlight position for the static effect (Center-Right to balance text)
    let mouse = { x: 1200, y: 400 };

    onMount(() => {
        mounted = true;
        if (container) container.setAttribute('data-theme', 'dark');
    });
</script>

<div
    bind:this={container}
    class="relative w-full min-h-screen bg-[#050505] font-sans selection:bg-white/20 overflow-hidden"
    style="--mouse-x: {mouse.x}px; --mouse-y: {mouse.y}px;"
>
    <!-- Background Texture (Full Screen) -->
    <div
        class="fixed inset-0 pointer-events-none z-0"
        style="
            background-image: url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E&quot;);
            opacity: 0.15;
            mix-blend-mode: overlay;
        "
    ></div>

    <!-- SPOTLIGHT EFFECT (Full Screen) -->
    <div class="fixed inset-0 pointer-events-none z-10 wave-grid-spotlight opacity-80"></div>

    <!-- CONTENT CONTAINER (Fixed 1600x900) -->
    <div
        class="relative z-20 mx-auto w-[1600px] h-[900px] flex flex-col justify-between p-20"
        style="min-height: 900px !important; max-height: 900px !important;"
    >
        <!-- 1. HEADER: BRANDING -->
        <div
            class="z-50 {mounted
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-2'} transition-all duration-1000"
        >
            <div class="flex items-center gap-3 opacity-100 origin-top-left scale-[2.5]">
                <ZarfLogo size="lg" />
            </div>
        </div>

        <!-- 2. MAIN CONTENT (Restored to "Like the Attachment") -->
        <div class="absolute top-1/2 left-20 right-20 -translate-y-1/2 z-30 pointer-events-none">
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
                        class="block text-[#FAFAFA] {mounted
                            ? 'opacity-100 translate-y-0'
                            : 'opacity-0 translate-y-4'} transition-all duration-1000 delay-200"
                    >
                        E-Mail First
                    </span>
                    <span
                        class="block text-white/50 {mounted
                            ? 'opacity-100 translate-y-0'
                            : 'opacity-0 translate-y-4'} transition-all duration-1000 delay-300"
                    >
                        Confidential Token Distributions
                    </span>
                </h1>
            </div>
        </div>

        <!-- 3. FOOTER: DETAILS REMOVED -->
        <div
            class="z-40 w-full flex items-end justify-between {mounted
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2'} transition-all duration-1000 delay-500"
        >
            <div class="flex flex-col gap-2">
                <span class="text-xs font-mono text-white/40 tracking-wider"> BUILT ON </span>
                <div class="flex items-center gap-3">
                    <img src="/stellar-logo.svg" alt="Stellar" class="h-16 w-auto opacity-90" />
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .wave-grid-spotlight {
        background-image: repeating-radial-gradient(
            circle at 0% 100%,
            transparent 0,
            transparent 50px,
            rgba(255, 255, 255, 0.15) 50px,
            rgba(255, 255, 255, 0.25) 53px,
            transparent 53px
        );
        background-size: 150% 150%;
        mask-image: radial-gradient(
            circle 1200px at var(--mouse-x) var(--mouse-y),
            black 0%,
            transparent 80%
        );
        -webkit-mask-image: radial-gradient(
            circle 1200px at var(--mouse-x) var(--mouse-y),
            black 0%,
            transparent 80%
        );
    }

    :global(body) {
        margin: 0;
        padding: 0;
        background: #050505;
    }
</style>
