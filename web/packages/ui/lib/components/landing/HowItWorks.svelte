<script lang="ts">
    import { onMount } from "svelte";
    import {
        Mail,
        Wallet,
        Shield,
        Clock,
        Lock,
        Sparkles,
    } from "lucide-svelte";

    // ═══════════════════════════════════════════════════════════════════════════
    // DATA
    // ═══════════════════════════════════════════════════════════════════════════
    const STEPS = [
        {
            title: "Email-First Distribution",
            subtitle: "Like Web2, Built for Web3",
            desc: "Forget wallet collection. Just upload a CSV of emails. Whether it's 10 employees or 10,000 community members, distribution is instant and frictionless.",
        },
        {
            title: "Total Unlinkability",
            subtitle: "Claim to Fresh Wallets",
            desc: "Your users prove ownership of their email using Zero-Knowledge proofs. This allows them to claim assets to a brand new wallet with zero on-chain history linking back to their identity.",
        },
        {
            title: "Programmable Privacy",
            subtitle: "Vesting & Compliance",
            desc: "Enforce smart contract rules like 4-year vesting schedules or regulatory geofencing entirely within the privacy circuit. Control without compromise.",
        },
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════
    let activeIndex = $state(0);
    let progress = $state(0); // 0 to 1 for entire section
    let sectionEl: HTMLElement;

    // ═══════════════════════════════════════════════════════════════════════════
    // SCROLL LOGIC
    // ═══════════════════════════════════════════════════════════════════════════
    onMount(() => {
        const handleScroll = () => {
            if (!sectionEl) return;

            const rect = sectionEl.getBoundingClientRect();
            const sectionHeight = rect.height;
            const viewportHeight = window.innerHeight;

            // How far we've scrolled into the section (0 = just entered, 1 = about to leave)
            const scrolled = -rect.top;
            const scrollableDistance = sectionHeight - viewportHeight;

            if (scrollableDistance > 0) {
                progress = Math.max(0, Math.min(1, scrolled / scrollableDistance));
                // Map progress to step index
                activeIndex = Math.min(
                    STEPS.length - 1,
                    Math.floor(progress * STEPS.length)
                );
            }
        };

        let ticking = false;
        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        handleScroll();

        return () => window.removeEventListener("scroll", onScroll);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════════════════════════════════════════
    function goToStep(index: number) {
        if (!sectionEl) return;
        const rect = sectionEl.getBoundingClientRect();
        const sectionHeight = rect.height;
        const viewportHeight = window.innerHeight;
        const scrollableDistance = sectionHeight - viewportHeight;
        const sectionTop = window.scrollY + rect.top;

        // Calculate target scroll position
        const targetProgress = index / STEPS.length;
        const targetScroll = sectionTop + targetProgress * scrollableDistance;

        window.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
</script>

<!--
  Section height = (steps + 1) * 100vh
  This creates scroll runway while content stays sticky
-->
<section
    bind:this={sectionEl}
    class="relative"
    style="height: {(STEPS.length + 0.5) * 100}vh;"
>
    <!-- Sticky Container: stays in viewport while scrolling -->
    <div class="sticky top-0 h-screen flex items-center overflow-hidden">
        <div class="container mx-auto px-6 max-w-6xl">
            <div class="grid md:grid-cols-2 gap-8 md:gap-16 lg:gap-24 items-center">

                <!-- LEFT: Text + Indicator -->
                <div class="relative order-2 md:order-1">
                    <!-- Step Indicator (inline, part of content) -->
                    <div class="flex items-center gap-2.5 mb-8">
                        {#each STEPS as _, i}
                            <button
                                onclick={() => goToStep(i)}
                                class="group flex items-center gap-1.5 transition-all duration-300"
                            >
                                <span
                                    class="font-mono text-[10px] font-medium transition-all duration-300 {activeIndex === i ? 'text-base-content/70' : 'text-base-content/25'}"
                                >
                                    0{i + 1}
                                </span>
                                <div
                                    class="h-0.5 rounded-full transition-all duration-500 {activeIndex === i
                                        ? 'w-6 bg-base-content/50'
                                        : activeIndex > i
                                            ? 'w-3 bg-base-content/30'
                                            : 'w-3 bg-base-content/10'}"
                                ></div>
                            </button>
                        {/each}
                    </div>

                    <!-- Stacked Text Content -->
                    <div class="relative h-[240px] md:h-[280px]">
                        {#each STEPS as step, i}
                            <div
                                class="absolute inset-0 transition-all duration-500 ease-out"
                                style="
                                    opacity: {activeIndex === i ? 1 : 0};
                                    transform: translateY({activeIndex === i ? 0 : activeIndex > i ? -20 : 20}px);
                                    pointer-events: {activeIndex === i ? 'auto' : 'none'};
                                "
                            >
                                <h3 class="text-2xl md:text-3xl lg:text-4xl font-semibold mb-3 tracking-tight text-base-content">
                                    {step.title}
                                </h3>
                                <h4 class="text-base md:text-lg text-base-content/45 mb-4 font-normal">
                                    {step.subtitle}
                                </h4>
                                <p class="text-sm md:text-base leading-relaxed text-base-content/40 max-w-md">
                                    {step.desc}
                                </p>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- RIGHT: Stacked Visuals -->
                <div class="order-1 md:order-2 flex justify-center">
                    <div class="relative w-full max-w-[260px] md:max-w-[340px] aspect-square">
                        <!-- Subtle Glow -->
                        <div class="absolute inset-4 bg-base-content/[0.02] rounded-full blur-2xl scale-110"></div>

                        <!-- Stacked Scenes -->
                        <div class="relative w-full h-full">
                            {#each STEPS as _, i}
                                <div
                                    class="absolute inset-0 bg-base-100/80 backdrop-blur-sm rounded-2xl border border-base-content/[0.06] overflow-hidden transition-all duration-500 ease-out"
                                    style="
                                        opacity: {activeIndex === i ? 1 : 0};
                                        transform: scale({activeIndex === i ? 1 : 0.97}) translateY({activeIndex === i ? 0 : activeIndex > i ? -15 : 15}px);
                                        box-shadow: 0 4px 20px -4px oklch(22% 0.01 290 / 0.06);
                                    "
                                >
                                    {#if i === 0}
                                        <!-- Scene 1: Email List -->
                                        <div class="absolute inset-0 flex flex-col items-center justify-center p-6">
                                            <div class="space-y-2.5 w-full max-w-[200px]">
                                                {#each [0, 1, 2] as k}
                                                    <div
                                                        class="flex items-center gap-2.5 p-2.5 bg-base-content/[0.02] rounded-lg border border-base-content/[0.04] transition-all duration-500"
                                                        style="
                                                            opacity: {activeIndex === 0 ? 1 : 0};
                                                            transform: translateY({activeIndex === 0 ? 0 : 12}px);
                                                            transition-delay: {k * 60}ms;
                                                        "
                                                    >
                                                        <div class="w-7 h-7 rounded-full bg-base-content/[0.04] flex items-center justify-center">
                                                            <Mail class="w-3.5 h-3.5 text-base-content/40" />
                                                        </div>
                                                        <div class="flex-1 space-y-1.5">
                                                            <div class="h-1.5 bg-base-content/[0.06] rounded w-20"></div>
                                                            <div class="h-1 bg-base-content/[0.04] rounded w-14"></div>
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                            <div
                                                class="mt-5 px-3 py-1 rounded-full bg-base-content/[0.03] border border-base-content/[0.06] transition-all duration-500"
                                                style="
                                                    opacity: {activeIndex === 0 ? 1 : 0};
                                                    transform: translateY({activeIndex === 0 ? 0 : 8}px);
                                                    transition-delay: 200ms;
                                                "
                                            >
                                                <span class="text-[10px] font-medium tracking-wide text-base-content/50 flex items-center gap-1.5 uppercase">
                                                    <Sparkles class="w-2.5 h-2.5" />
                                                    Just Emails
                                                </span>
                                            </div>
                                        </div>

                                    {:else if i === 1}
                                        <!-- Scene 2: Unlinkability -->
                                        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                                            <div
                                                class="w-11 h-11 rounded-xl bg-base-content/[0.03] border border-base-content/[0.06] flex items-center justify-center transition-all duration-500"
                                                style="
                                                    transform: translateY({activeIndex === 1 ? 0 : -15}px);
                                                    opacity: {activeIndex === 1 ? 0.5 : 0};
                                                "
                                            >
                                                <Mail class="w-5 h-5 text-base-content/40" />
                                            </div>

                                            <div
                                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-content/[0.02] border border-base-content/[0.05] transition-all duration-500"
                                                style="
                                                    transform: scale({activeIndex === 1 ? 1 : 0.95});
                                                    opacity: {activeIndex === 1 ? 1 : 0};
                                                    transition-delay: 80ms;
                                                "
                                            >
                                                <div class="w-1.5 h-1.5 rounded-full bg-base-content/30"></div>
                                                <span class="text-[10px] font-medium tracking-wide text-base-content/50 uppercase">Unlinkable</span>
                                            </div>

                                            <div
                                                class="w-12 h-12 rounded-xl bg-base-content/[0.04] border border-base-content/[0.08] flex items-center justify-center transition-all duration-500"
                                                style="
                                                    transform: translateY({activeIndex === 1 ? 0 : 15}px);
                                                    opacity: {activeIndex === 1 ? 1 : 0};
                                                    transition-delay: 160ms;
                                                "
                                            >
                                                <Wallet class="w-5 h-5 text-base-content/50" />
                                            </div>
                                        </div>

                                    {:else}
                                        <!-- Scene 3: Programmable -->
                                        <div class="absolute inset-0 flex items-center justify-center p-6">
                                            <div class="relative w-36 h-36">
                                                <!-- Orbits -->
                                                <div
                                                    class="absolute inset-0 border border-dashed border-base-content/[0.08] rounded-full transition-all duration-700"
                                                    style="
                                                        transform: scale({activeIndex === 2 ? 1 : 0.85}) rotate({activeIndex === 2 ? 0 : -20}deg);
                                                        opacity: {activeIndex === 2 ? 1 : 0};
                                                    "
                                                ></div>
                                                <div
                                                    class="absolute inset-2.5 border border-base-content/[0.04] rounded-full transition-all duration-700"
                                                    style="
                                                        transform: scale({activeIndex === 2 ? 1 : 0.85}) rotate({activeIndex === 2 ? 0 : 20}deg);
                                                        opacity: {activeIndex === 2 ? 1 : 0};
                                                        transition-delay: 80ms;
                                                    "
                                                ></div>

                                                <!-- Center -->
                                                <div class="absolute inset-0 flex items-center justify-center">
                                                    <div
                                                        class="w-16 h-16 rounded-full bg-base-content/[0.03] border border-base-content/[0.06] flex flex-col items-center justify-center transition-all duration-500"
                                                        style="
                                                            transform: scale({activeIndex === 2 ? 1 : 0.85});
                                                            opacity: {activeIndex === 2 ? 1 : 0};
                                                        "
                                                    >
                                                        <Shield class="w-5 h-5 text-base-content/50" />
                                                        <span class="text-[7px] font-medium tracking-wider text-base-content/30 mt-0.5 uppercase">Private</span>
                                                    </div>
                                                </div>

                                                <!-- Satellites -->
                                                <div
                                                    class="absolute top-0 right-1 px-1.5 py-0.5 rounded bg-base-content/[0.03] border border-base-content/[0.06] text-[9px] font-mono flex items-center gap-1 transition-all duration-500"
                                                    style="
                                                        transform: translate({activeIndex === 2 ? 0 : 15}px, {activeIndex === 2 ? 0 : -8}px);
                                                        opacity: {activeIndex === 2 ? 1 : 0};
                                                        transition-delay: 160ms;
                                                    "
                                                >
                                                    <Clock class="w-2 h-2 text-base-content/40" />
                                                    <span class="text-base-content/40">4y</span>
                                                </div>
                                                <div
                                                    class="absolute bottom-0 left-1 px-1.5 py-0.5 rounded bg-base-content/[0.03] border border-base-content/[0.06] text-[9px] font-mono flex items-center gap-1 transition-all duration-500"
                                                    style="
                                                        transform: translate({activeIndex === 2 ? 0 : -15}px, {activeIndex === 2 ? 0 : 8}px);
                                                        opacity: {activeIndex === 2 ? 1 : 0};
                                                        transition-delay: 240ms;
                                                    "
                                                >
                                                    <Lock class="w-2 h-2 text-base-content/40" />
                                                    <span class="text-base-content/40">Geo</span>
                                                </div>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>
