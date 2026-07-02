<script lang="ts">
    import { onMount } from 'svelte';
    import { ArrowRight, Banknote, ChevronDown, Gift, Hourglass, Lock } from 'lucide-svelte';
    import { browser } from '@zarf/core/utils/ssr';
    import { themeStore } from '../../stores/themeStore.svelte';
    import ZenButton from '../../components/ui/ZenButton.svelte';

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
    const HIDDEN_DATA = ['Private Claim'];

    // Rotating headline objects, recipient-voiced — each pairs a real Zarf
    // use case with its mark. Labels are kept near-equal length so the
    // fixed-width slot never looks empty.
    const ROTATING = [
        { label: 'private tokens', icon: Lock },
        { label: 'token airdrops', icon: Gift },
        { label: 'your payroll', icon: Banknote },
        { label: 'vesting grants', icon: Hourglass },
    ];
    let rotateIdx = $state(0);

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
        return themeStore.current === 'dark';
    });

    // --- Helpers ---
    function generateHash(): string {
        // Stellar strkey fragments: accounts are G[A-D]..., contracts C[A-D]...
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
        const prefix =
            (Math.random() > 0.5 ? 'C' : 'G') + 'ABCD'[Math.floor(Math.random() * 4)];
        return prefix + pick() + pick() + '....' + pick() + pick() + pick() + pick();
    }

    function initPoints() {
        if (!container || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        width = container.offsetWidth;
        height = container.offsetHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;

        ctx = canvas.getContext('2d');
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
        const textColor = isDark ? '200, 200, 200' : '60, 55, 70';
        const accentColor = isDark ? '180, 180, 190' : '90, 80, 120';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

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
            container.style.setProperty('--mouse-x', `${mouse.x}px`);
            container.style.setProperty('--mouse-y', `${mouse.y}px`);

            framePending = false;
        });
    }

    function handleMouseLeave() {
        mouse.x = -999;
        mouse.y = -999;
        if (container) {
            container.style.setProperty('--mouse-x', '-999px');
            container.style.setProperty('--mouse-y', '-999px');
        }
    }

    // --- Lifecycle ---
    onMount(() => {
        if (!browser) return;
        mounted = true; // Trigger SSR-safe theme check

        // Respect the user's reduced-motion preference. The canvas is a purely
        // decorative reveal effect, so under `prefers-reduced-motion: reduce`
        // we skip rAF entirely and leave the canvas blank. The CSS-driven
        // wave-grid spotlight remains active because it is mask-position only,
        // not transform/opacity animation.
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!reduceMotion) {
            initPoints();
            animate();
        }

        const resizeObserver = new ResizeObserver(() => {
            if (!reduceMotion) initPoints();
        });
        resizeObserver.observe(container);

        // Cycle the headline object. Under reduced motion the swap still
        // happens but transitions are disabled, so it reads as a plain change.
        const rotateTimer = setInterval(() => {
            rotateIdx = (rotateIdx + 1) % ROTATING.length;
        }, 2600);

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
            resizeObserver.disconnect();
            clearInterval(rotateTimer);
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
    <div class="absolute inset-0 pointer-events-none z-0 wave-grid-spotlight"></div>

    <!-- 2. Data Points Canvas -->
    <p class="sr-only">
        Decorative background: hashed placeholders that reveal &ldquo;Private Claim&rdquo; labels
        under the cursor. No interactive content.
    </p>
    <canvas
        bind:this={canvas}
        aria-hidden="true"
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
    <div class="relative z-30 text-center max-w-4xl px-6 flex flex-col items-center gap-5 md:gap-6">
        <!-- Headline: one recipient-voiced sentence; the object slot "declassifies".
             Monochrome system (zen-primary ~= zen-fg), so the changing word is
             marked by motion + a quiet leading glyph, not color or an underline. -->
        <h1
            class="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-zen-fg leading-[1.12] [text-wrap:balance] transition-opacity duration-1000 ease-out {mounted
                ? 'opacity-100'
                : 'opacity-0'}"
            style="transition-delay: 400ms;"
        >
            Receive
            <!-- Slot sits on the text baseline: each word is normal inline flow in
                 a stacked grid cell, so its baseline matches the sentence exactly. -->
            <span class="inline-grid justify-items-center align-baseline mx-1" aria-hidden="true">
                {#each ROTATING as item, i (item.label)}
                    <span
                        class="col-start-1 row-start-1 whitespace-nowrap transition-all duration-500 ease-out motion-reduce:transition-none {i ===
                        rotateIdx
                            ? 'opacity-100 blur-none'
                            : 'opacity-0 blur-sm'}"
                    >
                        <item.icon
                            class="inline-block align-[-0.06em] w-[0.5em] h-[0.5em] mr-2 sm:mr-2.5 opacity-40"
                            strokeWidth={2}
                        />{item.label}
                    </span>
                {/each}
            </span>
            <span class="sr-only">private tokens, token airdrops, your payroll, and vesting grants</span>
            on Stellar.
        </h1>

        <!-- Subtitle -->
        <p
            class="text-base md:text-lg text-zen-fg/60 max-w-xl text-center leading-normal transition-all duration-700 ease-out {mounted
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5'}"
            style="transition-delay: 600ms;"
        >
            Tokens arrive in your inbox, sealed with ZK proofs.<br class="hidden sm:block" />
            Claim with a Google sign-in &mdash; no wallet to start, no identity leaks.
        </p>

        <!-- CTA Group -->
        <div
            class="flex flex-col sm:flex-row items-center gap-4 mt-6 transition-all duration-700 ease-out {mounted
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5'}"
            style="transition-delay: 1200ms;"
        >
            <a href="https://claim.zarf.to" class="inline-block">
                <ZenButton
                    variant="primary"
                    size="lg"
                    class="rounded-full !bg-zen-fg/90 backdrop-blur-sm !text-zen-bg hover:shadow-lg hover:shadow-zen-fg/10 w-full sm:w-auto"
                >
                    Claim your tokens
                    {#snippet iconRight()}
                        <ArrowRight class="w-3.5 h-3.5" />
                    {/snippet}
                </ZenButton>
            </a>
            <a href="https://create.zarf.to" class="inline-block">
                <ZenButton
                    variant="secondary"
                    size="lg"
                    class="rounded-full !bg-zen-fg/5 backdrop-blur-md !text-zen-fg/60 !border-zen-fg/10 hover:!text-zen-fg w-full sm:w-auto"
                >
                    Create a distribution
                </ZenButton>
            </a>
        </div>

        <!-- Honest status line — the Stellar mark sits in a glyph+wordmark lockup. -->
        <p
            class="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.15em] uppercase text-zen-fg/35 transition-opacity duration-700 ease-out {mounted
                ? 'opacity-100'
                : 'opacity-0'}"
            style="transition-delay: 1500ms;"
        >
            Live on
            <span class="inline-flex items-center gap-1 text-zen-fg/55">
                <svg
                    class="w-3 h-3 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        d="M12.003 1.716c-1.37 0-2.7.27-3.948.78A10.18 10.18 0 0 0 2.66 7.901a10.136 10.136 0 0 0-.797 3.954c0 .258.01.516.027.775a1.942 1.942 0 0 1-1.055 1.88L0 14.934v1.902l2.463-1.26.072-.032v.005l.77-.39.758-.385.066-.039 14.807-7.56 1.666-.847 3.392-1.732V2.694L17.792 5.86 3.744 13.025l-.104.055-.017-.115a8.286 8.286 0 0 1-.071-1.105c0-2.255.88-4.377 2.474-5.977a8.462 8.462 0 0 1 2.71-1.82 8.513 8.513 0 0 1 3.2-.654h.067a8.41 8.41 0 0 1 4.09 1.055l1.628-.83.126-.066a10.11 10.11 0 0 0-5.845-1.853zM24 7.143 5.047 16.808l-1.666.847L0 19.382v1.902l3.282-1.671 2.91-1.485 14.058-7.153.105-.055.016.115c.05.369.072.743.072 1.11 0 2.255-.88 4.383-2.475 5.978a8.461 8.461 0 0 1-2.71 1.82 8.305 8.305 0 0 1-3.2.654h-.06c-1.441 0-2.86-.369-4.102-1.061l-.066.033-1.683.857c.594.418 1.232.776 1.903 1.062a10.11 10.11 0 0 0 3.947.797 10.09 10.09 0 0 0 7.17-2.975 10.136 10.136 0 0 0 2.969-7.18c0-.259-.005-.523-.027-.781a1.942 1.942 0 0 1 1.055-1.88L24 9.044z"
                    ></path>
                </svg>
                Stellar
            </span>
            testnet
        </p>
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
