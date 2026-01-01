<script lang="ts">
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";
    import { ArrowRight, ChevronDown } from "lucide-svelte";
    import { browser } from "$app/environment";
    import { themeStore } from "$lib/stores/themeStore.svelte";

    // --- State & Config ---
    let canvas: HTMLCanvasElement;
    let container: HTMLDivElement;
    let ctx: CanvasRenderingContext2D | null = null;
    let animationId: number;
    let width = 0;
    let height = 0;
    let mounted = $state(false); // SSR-safe flag

    // "Zen Pro" Configuration
    const GRID_SPACING = 100;
    const REVEAL_RADIUS = 200;
    // Two reveal words as requested
    const HIDDEN_DATA = ["Encrypted"];

    let mouse = { x: -999, y: -999 };

    interface Point {
        x: number;
        y: number;
        baseHash: string;
        revealedText: string | null;
        opacity: number;
        targetOpacity: number;
        isRevealed: boolean;
    }

    let points: Point[] = [];

    // Derived: Theme check (SSR-safe)
    let isDark = $derived(mounted ? themeStore.current !== "nord" : true);

    // --- Helpers ---
    function generateHash(): string {
        return "0x" + Math.random().toString(16).substring(2, 6);
    }

    function initPoints() {
        if (!container || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        width = container.offsetWidth;
        height = container.offsetHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;

        ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);

        points = [];
        const cols = Math.ceil(width / GRID_SPACING);
        const rows = Math.ceil(height / GRID_SPACING);
        let dataIndex = 0;

        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                // Organic Grid Distribution
                const x = i * GRID_SPACING + (Math.random() * 40 - 20);
                const y = j * GRID_SPACING + (Math.random() * 40 - 20);

                let revealedText = null;
                // Randomized Data Injection
                if (Math.random() > 0.8) {
                    revealedText = HIDDEN_DATA[dataIndex % HIDDEN_DATA.length];
                    dataIndex++;
                }

                points.push({
                    x,
                    y,
                    baseHash: generateHash(),
                    revealedText,
                    opacity: 0, // Starts completely invisible
                    targetOpacity: 0,
                    isRevealed: false,
                });
            }
        }
    }

    function animate() {
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        // Styling based on Theme (using derived isDark)
        const textColor = isDark ? "200, 200, 200" : "80, 80, 80";
        const accentColor = isDark ? "34, 211, 238" : "46, 144, 255";

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        points.forEach((point) => {
            const dx = mouse.x - point.x;
            const dy = mouse.y - point.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Interaction Logic
            if (dist < REVEAL_RADIUS) {
                const intensity = 1 - dist / REVEAL_RADIUS;
                point.targetOpacity = 0.3 + intensity * 0.7; // Visible on hover

                if (dist < REVEAL_RADIUS * 0.6 && point.revealedText) {
                    point.isRevealed = true;
                } else {
                    point.isRevealed = false;
                }
            } else {
                point.targetOpacity = 0; // Return to INVISIBLE
                point.isRevealed = false;
            }

            // Smooth Interpolation
            point.opacity += (point.targetOpacity - point.opacity) * 0.1;

            if (point.opacity > 0.01) {
                if (point.isRevealed && point.revealedText) {
                    // Title/Revealed Text
                    ctx!.font = `500 13px "Inter", sans-serif`;
                    ctx!.fillStyle = `rgba(${accentColor}, ${point.opacity})`;
                    ctx!.fillText(point.revealedText, point.x, point.y);
                } else {
                    // Base Hash
                    ctx!.font = `11px "JetBrains Mono", monospace`;
                    ctx!.fillStyle = `rgba(${textColor}, ${point.opacity})`;
                    ctx!.fillText(point.baseHash, point.x, point.y);
                }
            }
        });

        animationId = requestAnimationFrame(animate);
    }

    // --- Interaction ---
    function handleMouseMove(e: MouseEvent) {
        if (!container) return;
        const rect = container.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;

        // Spotlight CSS Variables
        container.style.setProperty("--mouse-x", `${mouse.x}px`);
        container.style.setProperty("--mouse-y", `${mouse.y}px`);
    }

    function handleMouseLeave() {
        mouse.x = -999;
        mouse.y = -999;
        if (container) {
            container.style.setProperty("--mouse-x", "-999px");
            container.style.setProperty("--mouse-y", "-999px");
        }
    }

    // --- Lifecycle ---
    onMount(() => {
        if (!browser) return;
        mounted = true; // Trigger SSR-safe theme check
        initPoints();
        animate();

        const resizeObserver = new ResizeObserver(() => initPoints());
        resizeObserver.observe(container);

        return () => {
            cancelAnimationFrame(animationId);
            resizeObserver.disconnect();
        };
    });
</script>

<div
    bind:this={container}
    onmousemove={handleMouseMove}
    onmouseleave={handleMouseLeave}
    role="presentation"
    class="relative w-full min-h-[90vh] flex flex-col items-center justify-center overflow-hidden bg-base-100 selection:bg-primary/20 hero-container"
>
    <!-- 1. Wave Grid (Spotlight) -->
    <div
        class="absolute inset-0 pointer-events-none z-0 wave-grid-spotlight"
    ></div>

    <!-- 2. Data Points Canvas -->
    <canvas
        bind:this={canvas}
        class="absolute inset-0 w-full h-full pointer-events-none z-10"
    ></canvas>

    <!-- 3. Ambient Gradient (Atmosphere) -->
    <div class="absolute inset-0 pointer-events-none z-20 gradient-layer"></div>

    <!-- 4. Grain Overlay (Masterpiece Recipe) -->
    <div
        class="grain-overlay"
        class:blend-screen={isDark}
        class:blend-multiply={!isDark}
    ></div>

    <!-- 5. Content Block -->
    <div
        class="relative z-30 text-center max-w-4xl px-6 flex flex-col items-center gap-8 md:gap-10"
    >
        <!-- Local Text Backdrop (Glow) - High Readability & Wider -->
        <div
            class="absolute inset-0 -z-10 bg-[radial-gradient(closest-side,var(--color-base-100)_50%,transparent_100%)] blur-2xl scale-150 pointer-events-none"
        ></div>

        <!-- Feature Badge -->
        <div
            in:fly={{ y: 20, duration: 800, delay: 200 }}
            class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-base-200/50 border border-base-content/10 backdrop-blur-md text-xs font-medium text-base-content/70 shadow-sm"
        >
            <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
            ></span>
            Confidential Vesting Protocol
        </div>

        <!-- Headline: Confidential. Distributions. -->
        <h1
            class="text-6xl sm:text-7xl md:text-9xl font-thin tracking-tighter text-base-content leading-[0.9]"
        >
            <span in:fade={{ duration: 1000, delay: 400 }} class="block"
                >Confidential.</span
            >
            <span
                in:fade={{ duration: 1000, delay: 800 }}
                class="block font-light text-base-content/60"
                >Distributions.</span
            >
        </h1>

        <!-- Subtitle: Focus on Payroll/Angel use cases & Anti-Doxxing -->
        <p
            in:fly={{ y: 20, duration: 800, delay: 1000 }}
            class="text-lg md:text-xl text-base-content/50 max-w-xl font-light leading-relaxed"
        >
            The privacy standard for payroll and investments.
            <br />
            <span class="text-base-content/40 text-sm mt-3 block"
                >Distribute tokens via email without doxxing recipient wallets.</span
            >
        </p>

        <!-- CTA Group -->
        <div
            in:fly={{ y: 20, duration: 800, delay: 1200 }}
            class="flex flex-col sm:flex-row items-center gap-4 mt-6"
        >
            <a
                href="/wizard"
                class="btn btn-primary btn-lg rounded-full px-8 font-normal shadow-lg shadow-primary/20 hover:scale-105 transition-all"
            >
                Start Distribution
                <ArrowRight class="w-4 h-4 ml-2" />
            </a>
            <a
                href="/claim"
                class="btn btn-ghost btn-lg rounded-full px-8 font-normal hover:bg-base-content/5"
            >
                Claim Tokens
            </a>
        </div>
    </div>

    <!-- Scroll Indicator -->
    <div
        in:fade={{ duration: 800, delay: 1800 }}
        class="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-base-content/20 z-40"
    >
        <span class="text-[10px] uppercase tracking-widest">Scroll</span>
        <ChevronDown class="w-4 h-4 animate-bounce" />
    </div>
</div>

<style>
    /* 
     * Masterpiece Effect Layers 
     */

    /* 1. Grain Overlay Scheme */
    .grain-overlay {
        position: fixed;
        /* Oversized to prevent flickering edges during animation */
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;

        pointer-events: none;
        z-index: 9999;

        /* Recipe Implementation */
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E");
        background-size: 150px;
        animation: noise-animation 0.5s steps(4) infinite; /* Fast noise */
    }

    /* Theme-specific blends - More hazy/misty */
    .blend-screen {
        mix-blend-mode: screen;
        opacity: 0.18;
    }

    .blend-multiply {
        mix-blend-mode: multiply;
        opacity: 0.08;
    }

    @keyframes noise-animation {
        0% {
            transform: translate(0, 0);
        }
        10% {
            transform: translate(-5%, -5%);
        }
        50% {
            transform: translate(-10%, 5%);
        }
        100% {
            transform: translate(5%, -10%);
        }
    }

    /* 2. Gradient Atmosphere - Matching wave-grid origin & animation */
    .gradient-layer {
        background: radial-gradient(
            circle at 50% 100%,
            color-mix(in oklch, var(--color-base-200), transparent 10%) 0%,
            color-mix(in oklch, var(--color-base-200), transparent 40%) 25%,
            color-mix(in oklch, var(--color-base-200), transparent 70%) 50%,
            transparent 80%
        );
        background-size: 100% 150%;
        animation: wave-breathe 8s ease-in-out infinite alternate;
        pointer-events: none;
    }

    /* 3. Wave Grid (Spotlight) */
    .wave-grid-spotlight {
        background-image: repeating-radial-gradient(
            circle at 50% 100%,
            transparent 0,
            transparent 50px,
            color-mix(in oklch, var(--color-base-content), transparent 85%) 50px,
            color-mix(in oklch, var(--color-base-content), transparent 80%) 52px,
            transparent 52px
        );
        background-size: 100% 150%;
        animation: wave-breathe 8s ease-in-out infinite alternate;

        /* Mask spotlight around cursor */
        mask-image: radial-gradient(
            circle 400px at var(--mouse-x, -999px) var(--mouse-y, -999px),
            black 0%,
            transparent 100%
        );
        -webkit-mask-image: radial-gradient(
            circle 400px at var(--mouse-x, -999px) var(--mouse-y, -999px),
            black 0%,
            transparent 100%
        );
    }

    @keyframes wave-breathe {
        0% {
            background-size: 100% 150%;
            opacity: 0.8;
        }
        100% {
            background-size: 103% 153%;
            opacity: 1;
        }
    }
</style>
