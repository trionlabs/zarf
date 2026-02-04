<script lang="ts">
    import { onMount } from "svelte";
    import { ArrowRight, ChevronDown } from "lucide-svelte";
    // SSR-safe browser check
    const browser = typeof window !== "undefined";
    import { themeStore } from "../../stores/themeStore.svelte";
    import Tooltip from "../../components/ui/Tooltip.svelte";
    import ZenButton from "../../components/ui/ZenButton.svelte";

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
    const HIDDEN_DATA = ["Private Claim"];

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

    // Derived: Theme check (SSR-safe) - only check after mounted
    let isDark = $derived.by(() => {
        if (!mounted) return true; // Default for SSR
        return themeStore.current === "dark";
    });

    // --- Helpers ---
    function generateHash(): string {
        const hex = Math.random().toString(16).substring(2, 10);
        return (
            "0x" + hex.substring(0, 2) + "...." + hex.substring(hex.length - 2)
        );
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
        // Light: cool grey-purple, Dark: silver-grey
        const textColor = isDark ? "200, 200, 200" : "60, 55, 70";
        const accentColor = isDark ? "180, 180, 190" : "90, 80, 120";

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const revealedPoints: Point[] = [];
        const basePoints: Point[] = [];

        // 1. Update State & Categorize
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
                    revealedPoints.push(point);
                } else {
                    basePoints.push(point);
                }
            }
        });

        // 2. Batch Draw Base Points (Monospace)
        if (basePoints.length > 0) {
            ctx.font = `11px "JetBrains Mono", monospace`;
            basePoints.forEach((point) => {
                ctx!.fillStyle = `rgba(${textColor}, ${point.opacity})`;
                ctx!.fillText(point.baseHash, point.x, point.y);
            });
        }

        // 3. Batch Draw Revealed Points (Inter)
        if (revealedPoints.length > 0) {
            ctx.font = `500 13px "Saira", sans-serif`;
            revealedPoints.forEach((point) => {
                ctx!.fillStyle = `rgba(${accentColor}, ${point.opacity})`;
                ctx!.fillText(point.revealedText!, point.x, point.y);
            });
        }

        animationId = requestAnimationFrame(animate);
    }

    // --- Interaction ---
    // --- Interaction ---
    let framePending = false;

    function handleMouseMove(e: MouseEvent) {
        if (!container || framePending) return;

        framePending = true;
        const clientX = e.clientX;
        const clientY = e.clientY;

        requestAnimationFrame(() => {
            if (!container) {
                framePending = false;
                return;
            }

            const rect = container.getBoundingClientRect();
            mouse.x = clientX - rect.left;
            mouse.y = clientY - rect.top;

            // Spotlight CSS Variables
            container.style.setProperty("--mouse-x", `${mouse.x}px`);
            container.style.setProperty("--mouse-y", `${mouse.y}px`);

            framePending = false;
        });
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
    class="relative w-full min-h-[90vh] flex flex-col items-center justify-center overflow-hidden bg-transparent selection:bg-primary/20 hero-container"
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

    <!-- 3. Text Backdrop (Blur ONLY) - Blurs the canvas dots behind text for readability -->
    <!-- Uses mask to fade the blur effect at edges. No broken gradients. -->
    <div
        class="absolute inset-0 pointer-events-none z-10"
        style="
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            mask-image: radial-gradient(circle at center, black 0%, transparent 60%);
            -webkit-mask-image: radial-gradient(circle at center, black 0%, transparent 60%);
        "
    ></div>

    <!-- Content Block -->
    <div
        class="relative z-30 text-center max-w-4xl px-6 flex flex-col items-center gap-5 md:gap-6"
    >
        <!-- Feature Badge -->
        <div
            class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zen-fg/10 bg-zen-fg/5 backdrop-blur-md text-[11px] font-medium tracking-[0.15em] uppercase text-zen-fg/60
                   transition-all duration-700 ease-out {mounted
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5'}"
            style="transition-delay: 200ms;"
        >
            <span class="w-1.5 h-1.5 rounded-full bg-zen-fg/40"></span>
            Confidential Vesting | Private Payroll
        </div>

        <!-- Headline -->
        <h1
            class="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-zen-fg leading-[1.05] transition-opacity duration-1000 ease-out {mounted
                ? 'opacity-100'
                : 'opacity-0'}"
            style="transition-delay: 400ms;"
        >
            Confidential Token<br class="hidden sm:block" /> Distributions & Payroll
        </h1>

        <!-- Subtitle -->
        <p
            class="text-base md:text-lg text-zen-fg/60 max-w-lg text-center leading-normal transition-all duration-700 ease-out {mounted
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5'}"
            style="transition-delay: 600ms;"
        >
            Distribute tokens to emails with ZK proofs.<br
                class="hidden sm:block"
            />
            No wallet exposure. No identity leaks.
        </p>

        <!-- CTA Group -->
        <div
            class="flex flex-col sm:flex-row items-center gap-4 mt-6 transition-all duration-700 ease-out {mounted
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5'}"
            style="transition-delay: 1200ms;"
        >
            <a
                href="https://x.com/trionlabs"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-block"
            >
                <ZenButton
                    variant="primary"
                    size="lg"
                    class="rounded-full !bg-zen-fg/90 backdrop-blur-sm !text-zen-bg hover:shadow-lg hover:shadow-zen-fg/10 w-full sm:w-auto"
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
            <Tooltip text="Coming Soon" position="bottom">
                <ZenButton
                    variant="secondary"
                    size="lg"
                    disabled
                    class="rounded-full !bg-zen-fg/5 backdrop-blur-md !text-zen-fg/40 !border-zen-fg/10 cursor-not-allowed"
                >
                    Claim Tokens
                    {#snippet iconRight()}
                        <ArrowRight class="w-3.5 h-3.5" />
                    {/snippet}
                </ZenButton>
            </Tooltip>
        </div>
    </div>

    <!-- Scroll Indicator -->
    <div
        class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-zen-fg/15 z-40 transition-opacity duration-700 ease-out {mounted
            ? 'opacity-100'
            : 'opacity-0'}"
        style="transition-delay: 1800ms;"
    >
        <ChevronDown class="w-4 h-4 animate-bounce" strokeWidth={1.5} />
    </div>
</div>

<style>
    /* 
     * Masterpiece Effect Layers 
     */

    /* Wave Grid (Spotlight) */
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
</style>
