<script lang="ts">
    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURES - Masterclass Hover Animations
    // Philosophy: Bold elegance, filling space, choreographed motion
    // ═══════════════════════════════════════════════════════════════════════════

    // Hover states
    let zkHovered = $state(false);
    let vestingHovered = $state(false);
    let claimHovered = $state(false);
    let dataHovered = $state(false);
</script>

<section class="py-32 relative">
    <div class="mx-auto px-6 max-w-6xl">
        <!-- Header -->
        <div class="text-center mb-20">
            <p class="text-base-content/30 text-xs font-medium tracking-[0.2em] uppercase mb-4">Features</p>
            <h2 class="text-4xl md:text-5xl font-semibold tracking-tight text-base-content mb-5">
                Privacy-First Distribution
            </h2>
            <p class="text-base-content/40 text-lg md:text-xl max-w-lg mx-auto">
                ZK powered, Web3 mindset, Web2 experience
            </p>
        </div>

        <!-- 2x2 Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">

            <!-- ═══════════════════════════════════════════════════════════════ -->
            <!-- Card 1: ZK Privacy - "The Veil" -->
            <!-- ═══════════════════════════════════════════════════════════════ -->
            <div
                class="group relative rounded-3xl bg-base-200/40 border border-base-content/[0.06] p-6 lg:p-8
                       hover:border-base-content/[0.12] hover:bg-base-200/60
                       shadow-sm hover:shadow-lg hover:shadow-base-content/[0.03]
                       transition-all duration-500 ease-out hover:-translate-y-0.5"
                onmouseenter={() => zkHovered = true}
                onmouseleave={() => zkHovered = false}
                role="article"
            >
                <!-- Scene -->
                <div class="relative aspect-[4/3] rounded-2xl overflow-hidden mb-6 bg-gradient-to-b from-base-content/[0.015] to-transparent">
                    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
                        <!-- Outer expanding rings -->
                        {#each [140, 115, 90, 65] as r, i}
                            <circle
                                cx="200" cy="150" r={r}
                                fill="none"
                                class="stroke-base-content transition-all ease-out"
                                style="
                                    stroke-width: {i === 0 ? 0.3 : 0.5};
                                    stroke-opacity: {zkHovered ? 0.15 - i * 0.03 : 0.03};
                                    transform: scale({zkHovered ? 1 : 0.6 + i * 0.1});
                                    transform-origin: 200px 150px;
                                    transition-duration: {900 + i * 100}ms;
                                    transition-delay: {zkHovered ? i * 80 : 0}ms;
                                "
                            />
                        {/each}

                        <!-- Primary circle -->
                        <circle
                            cx="200" cy="150" r="45"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 1.5;
                                stroke-opacity: {zkHovered ? 0.4 : 0.1};
                                stroke-dasharray: 283;
                                stroke-dashoffset: {zkHovered ? 0 : 283};
                                transition-duration: 1000ms;
                            "
                        />

                        <!-- Inner glow -->
                        <circle
                            cx="200" cy="150" r="30"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 25;
                                stroke-opacity: {zkHovered ? 0.04 : 0};
                                transform: scale({zkHovered ? 1 : 0.3});
                                transform-origin: 200px 150px;
                                transition-duration: 800ms;
                                transition-delay: {zkHovered ? 300 : 0}ms;
                            "
                        />

                        <!-- Orbital particles -->
                        {#each Array(12) as _, i}
                            {@const angle = i * 30}
                            {@const baseR = 45}
                            {@const expandR = 130}
                            {@const r = zkHovered ? expandR : baseR}
                            {@const x = 200 + Math.cos((angle - 90) * Math.PI / 180) * r}
                            {@const y = 150 + Math.sin((angle - 90) * Math.PI / 180) * r}
                            <circle
                                cx={x} cy={y}
                                r={zkHovered ? 3 : 1.5}
                                class="fill-base-content transition-all ease-out"
                                style="
                                    opacity: {zkHovered ? 0.5 : 0.1};
                                    transition-duration: 900ms;
                                    transition-delay: {zkHovered ? 400 + i * 40 : 0}ms;
                                "
                            />
                        {/each}

                        <!-- Center core with pulse -->
                        <circle
                            cx="200" cy="150"
                            r={zkHovered ? 8 : 5}
                            class="fill-base-content transition-all duration-500"
                            style="opacity: {zkHovered ? 0.6 : 0.2};"
                        />
                        {#if zkHovered}
                            <circle cx="200" cy="150" r="8" class="fill-base-content opacity-30">
                                <animate attributeName="r" values="8;20;8" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                            </circle>
                        {/if}
                    </svg>
                </div>

                <!-- Content -->
                <div>
                    <h3 class="text-xl lg:text-2xl font-semibold text-base-content mb-2">
                        Privacy powered with ZK
                    </h3>
                    <p class="text-base-content/40 text-sm lg:text-base leading-relaxed">
                        Distribute tokens without exposing recipient identities on-chain.
                    </p>
                </div>
            </div>

            <!-- ═══════════════════════════════════════════════════════════════ -->
            <!-- Card 2: Vesting - "The Spiral" -->
            <!-- ═══════════════════════════════════════════════════════════════ -->
            <div
                class="group relative rounded-3xl bg-base-200/40 border border-base-content/[0.06] p-6 lg:p-8
                       hover:border-base-content/[0.12] hover:bg-base-200/60
                       shadow-sm hover:shadow-lg hover:shadow-base-content/[0.03]
                       transition-all duration-500 ease-out hover:-translate-y-0.5"
                onmouseenter={() => vestingHovered = true}
                onmouseleave={() => vestingHovered = false}
                role="article"
            >
                <!-- Scene -->
                <div class="relative aspect-[4/3] rounded-2xl overflow-hidden mb-6 bg-gradient-to-b from-base-content/[0.015] to-transparent">
                    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
                        <!-- Large spiral path -->
                        <path
                            d="M 200 150
                               C 200 150, 215 150, 225 140
                               C 245 120, 250 90, 230 70
                               C 200 40, 150 45, 125 80
                               C 90 130, 95 190, 145 225
                               C 205 265, 290 255, 330 200
                               C 375 135, 360 50, 285 20
                               C 195 -15, 85 15, 40 100
                               C -10 195, 15 290, 120 290"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 1;
                                stroke-opacity: {vestingHovered ? 0.35 : 0.08};
                                stroke-dasharray: 1200;
                                stroke-dashoffset: {vestingHovered ? 0 : 1200};
                                transition-duration: 1800ms;
                            "
                        />

                        <!-- Milestone markers -->
                        {#each [
                            { x: 225, y: 140, label: "cliff", delay: 300 },
                            { x: 125, y: 80, label: "1y", delay: 500 },
                            { x: 330, y: 200, label: "2y", delay: 700 },
                            { x: 40, y: 100, label: "3y", delay: 900 },
                            { x: 120, y: 290, label: "4y", delay: 1100 },
                        ] as mark}
                            <g
                                class="transition-all ease-out"
                                style="
                                    opacity: {vestingHovered ? 1 : 0};
                                    transition-duration: 600ms;
                                    transition-delay: {vestingHovered ? mark.delay : 0}ms;
                                "
                            >
                                <circle
                                    cx={mark.x} cy={mark.y} r="5"
                                    class="fill-base-content"
                                    style="opacity: 0.45;"
                                />
                                <text
                                    x={mark.x + 10} y={mark.y + 4}
                                    class="fill-base-content font-mono"
                                    style="font-size: 11px; opacity: 0.4;"
                                >{mark.label}</text>
                            </g>
                        {/each}

                        <!-- Traveling light with glow trail -->
                        <circle r="12" class="fill-base-content" style="opacity: {vestingHovered ? 0.1 : 0};">
                            {#if vestingHovered}
                                <animateMotion
                                    dur="5s"
                                    repeatCount="indefinite"
                                    path="M 0 0 C 0 0, 15 0, 25 -10 C 45 -30, 50 -60, 30 -80 C 0 -110, -50 -105, -75 -70 C -110 -20, -105 40, -55 75 C 5 115, 90 105, 130 50 C 175 -15, 160 -100, 85 -130 C -5 -165, -115 -135, -160 -50 C -210 45, -185 140, -80 140"
                                />
                            {/if}
                        </circle>
                        <circle r="6" class="fill-base-content" style="opacity: {vestingHovered ? 0.6 : 0};">
                            {#if vestingHovered}
                                <animateMotion
                                    dur="5s"
                                    repeatCount="indefinite"
                                    path="M 0 0 C 0 0, 15 0, 25 -10 C 45 -30, 50 -60, 30 -80 C 0 -110, -50 -105, -75 -70 C -110 -20, -105 40, -55 75 C 5 115, 90 105, 130 50 C 175 -15, 160 -100, 85 -130 C -5 -165, -115 -135, -160 -50 C -210 45, -185 140, -80 140"
                                />
                            {/if}
                        </circle>

                        <!-- Origin point -->
                        <circle
                            cx="200" cy="150"
                            r={vestingHovered ? 6 : 4}
                            class="fill-base-content transition-all duration-500"
                            style="opacity: {vestingHovered ? 0.55 : 0.15};"
                        />
                    </svg>
                </div>

                <!-- Content -->
                <div>
                    <h3 class="text-xl lg:text-2xl font-semibold text-base-content mb-2">
                        On-chain & Programmable
                    </h3>
                    <p class="text-base-content/40 text-sm lg:text-base leading-relaxed">
                        Configure cliff periods and linear release schedules in smart contracts.
                    </p>
                </div>
            </div>

            <!-- ═══════════════════════════════════════════════════════════════ -->
            <!-- Card 3: Claiming - "The Flow" -->
            <!-- ═══════════════════════════════════════════════════════════════ -->
            <div
                class="group relative rounded-3xl bg-base-200/40 border border-base-content/[0.06] p-6 lg:p-8
                       hover:border-base-content/[0.12] hover:bg-base-200/60
                       shadow-sm hover:shadow-lg hover:shadow-base-content/[0.03]
                       transition-all duration-500 ease-out hover:-translate-y-0.5"
                onmouseenter={() => claimHovered = true}
                onmouseleave={() => claimHovered = false}
                role="article"
            >
                <!-- Scene -->
                <div class="relative aspect-[4/3] rounded-2xl overflow-hidden mb-6 bg-gradient-to-b from-base-content/[0.015] to-transparent">
                    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
                        <!-- Origin node -->
                        <circle
                            cx="50" cy="150" r="35"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 1;
                                stroke-opacity: {claimHovered ? 0.4 : 0.12};
                                stroke-dasharray: 220;
                                stroke-dashoffset: {claimHovered ? 0 : 220};
                                transition-duration: 800ms;
                            "
                        />
                        <circle
                            cx="50" cy="150" r="10"
                            class="fill-base-content transition-all duration-600"
                            style="opacity: {claimHovered ? 0.5 : 0.15};"
                        />
                        <text
                            x="50" y="157"
                            text-anchor="middle"
                            class="fill-base-content transition-all duration-500"
                            style="font-size: 22px; opacity: {claimHovered ? 0.5 : 0.2};"
                        >@</text>

                        <!-- Main flow curve -->
                        <path
                            d="M 85 150 C 140 150, 160 60, 200 60 C 240 60, 260 240, 315 150"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 1;
                                stroke-opacity: {claimHovered ? 0.35 : 0};
                                stroke-dasharray: 380;
                                stroke-dashoffset: {claimHovered ? 0 : 380};
                                transition-duration: 1200ms;
                                transition-delay: {claimHovered ? 200 : 0}ms;
                            "
                        />

                        <!-- Secondary curves -->
                        <path
                            d="M 50 115 Q 200 20, 350 115"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 0.5;
                                stroke-opacity: {claimHovered ? 0.12 : 0};
                                transition-duration: 800ms;
                                transition-delay: {claimHovered ? 700 : 0}ms;
                            "
                        />
                        <path
                            d="M 50 185 Q 200 280, 350 185"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 0.5;
                                stroke-opacity: {claimHovered ? 0.12 : 0};
                                transition-duration: 800ms;
                                transition-delay: {claimHovered ? 800 : 0}ms;
                            "
                        />

                        <!-- Traveling pulses with glow -->
                        {#each [0, 0.33, 0.66] as offset, i}
                            <circle
                                r={12 - i * 3}
                                class="fill-base-content"
                                style="opacity: {claimHovered ? 0.1 - i * 0.02 : 0};"
                            >
                                {#if claimHovered}
                                    <animateMotion
                                        dur="2.5s"
                                        repeatCount="indefinite"
                                        begin={`${offset * 2.5}s`}
                                        path="M 85 150 C 140 150, 160 60, 200 60 C 240 60, 260 240, 315 150"
                                        calcMode="spline"
                                        keySplines="0.4 0 0.2 1"
                                        keyTimes="0;1"
                                        keyPoints="0;1"
                                    />
                                {/if}
                            </circle>
                            <circle
                                r={5 - i}
                                class="fill-base-content"
                                style="opacity: {claimHovered ? 0.6 - i * 0.15 : 0};"
                            >
                                {#if claimHovered}
                                    <animateMotion
                                        dur="2.5s"
                                        repeatCount="indefinite"
                                        begin={`${offset * 2.5}s`}
                                        path="M 85 150 C 140 150, 160 60, 200 60 C 240 60, 260 240, 315 150"
                                        calcMode="spline"
                                        keySplines="0.4 0 0.2 1"
                                        keyTimes="0;1"
                                        keyPoints="0;1"
                                    />
                                {/if}
                            </circle>
                        {/each}

                        <!-- Destination node -->
                        <circle
                            cx="350" cy="150" r="35"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 1;
                                stroke-opacity: {claimHovered ? 0.4 : 0.08};
                                stroke-dasharray: 220;
                                stroke-dashoffset: {claimHovered ? 0 : 220};
                                transition-duration: 800ms;
                                transition-delay: {claimHovered ? 500 : 0}ms;
                            "
                        />
                        <circle
                            cx="350" cy="150" r="10"
                            class="fill-base-content transition-all ease-out"
                            style="
                                opacity: {claimHovered ? 0.5 : 0.08};
                                transition-duration: 600ms;
                                transition-delay: {claimHovered ? 600 : 0}ms;
                            "
                        />
                        <!-- Minimal wallet hint -->
                        <rect
                            x="342" y="145" width="16" height="10" rx="2"
                            fill="none"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 1;
                                stroke-opacity: {claimHovered ? 0.35 : 0};
                                transition-duration: 400ms;
                                transition-delay: {claimHovered ? 800 : 0}ms;
                            "
                        />
                    </svg>
                </div>

                <!-- Content -->
                <div>
                    <h3 class="text-xl lg:text-2xl font-semibold text-base-content mb-2">
                        E-mail First Claiming
                    </h3>
                    <p class="text-base-content/40 text-sm lg:text-base leading-relaxed">
                        No wallet needed to start. Recipients claim with just an email link.
                    </p>
                </div>
            </div>

            <!-- ═══════════════════════════════════════════════════════════════ -->
            <!-- Card 4: Verifiable - "The Ledger" -->
            <!-- ═══════════════════════════════════════════════════════════════ -->
            <div
                class="group relative rounded-3xl bg-base-200/40 border border-base-content/[0.06] p-6 lg:p-8
                       hover:border-base-content/[0.12] hover:bg-base-200/60
                       shadow-sm hover:shadow-lg hover:shadow-base-content/[0.03]
                       transition-all duration-500 ease-out hover:-translate-y-0.5"
                onmouseenter={() => dataHovered = true}
                onmouseleave={() => dataHovered = false}
                role="article"
            >
                <!-- Scene -->
                <div class="relative aspect-[4/3] rounded-2xl overflow-hidden mb-6 bg-gradient-to-b from-base-content/[0.015] to-transparent">
                    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
                        <!-- Vertical chain line -->
                        <line
                            x1="80" y1="30"
                            x2="80" y2="270"
                            class="stroke-base-content transition-all ease-out"
                            style="
                                stroke-width: 0.75;
                                stroke-opacity: {dataHovered ? 0.25 : 0.06};
                                stroke-dasharray: 240;
                                stroke-dashoffset: {dataHovered ? 0 : 240};
                                transition-duration: 800ms;
                            "
                        />

                        <!-- Verification blocks -->
                        {#each [
                            { y: 60, width: 260 },
                            { y: 120, width: 220 },
                            { y: 180, width: 280 },
                            { y: 240, width: 200 },
                        ] as block, i}
                            <!-- Connection dot -->
                            <circle
                                cx="80" cy={block.y}
                                r={dataHovered ? 6 : 4}
                                class="fill-base-content transition-all ease-out"
                                style="
                                    opacity: {dataHovered ? 0.5 : 0.12};
                                    transition-duration: 500ms;
                                    transition-delay: {dataHovered ? i * 150 : 0}ms;
                                "
                            />

                            <!-- Horizontal connector -->
                            <line
                                x1="86" y1={block.y}
                                x2="120" y2={block.y}
                                class="stroke-base-content transition-all ease-out"
                                style="
                                    stroke-width: 0.5;
                                    stroke-opacity: {dataHovered ? 0.25 : 0};
                                    stroke-dasharray: 34;
                                    stroke-dashoffset: {dataHovered ? 0 : 34};
                                    transition-duration: 400ms;
                                    transition-delay: {dataHovered ? 100 + i * 150 : 0}ms;
                                "
                            />

                            <!-- Block -->
                            <rect
                                x="120" y={block.y - 15}
                                width={block.width} height="30"
                                rx="8"
                                fill="none"
                                class="stroke-base-content transition-all ease-out"
                                style="
                                    stroke-width: 0.75;
                                    stroke-opacity: {dataHovered ? 0.3 : 0.06};
                                    stroke-dasharray: {(block.width + 30) * 2};
                                    stroke-dashoffset: {dataHovered ? 0 : (block.width + 30) * 2};
                                    transition-duration: 700ms;
                                    transition-delay: {dataHovered ? 150 + i * 150 : 0}ms;
                                "
                            />

                            <!-- Checkmark -->
                            <path
                                d="M {135 + block.width - 35} {block.y - 4} l 6 6 l 10 -12"
                                fill="none"
                                class="stroke-base-content transition-all ease-out"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="
                                    stroke-width: 1.5;
                                    stroke-opacity: {dataHovered ? 0.5 : 0};
                                    stroke-dasharray: 24;
                                    stroke-dashoffset: {dataHovered ? 0 : 24};
                                    transition-duration: 400ms;
                                    transition-delay: {dataHovered ? 400 + i * 150 : 0}ms;
                                "
                            />

                            <!-- Data placeholder -->
                            <line
                                x1="135" y1={block.y}
                                x2={135 + block.width - 60} y2={block.y}
                                class="stroke-base-content transition-all ease-out"
                                style="
                                    stroke-width: 2;
                                    stroke-opacity: {dataHovered ? 0.15 : 0};
                                    stroke-linecap: round;
                                    transition-duration: 500ms;
                                    transition-delay: {dataHovered ? 300 + i * 150 : 0}ms;
                                "
                            />
                        {/each}

                        <!-- Hash connections -->
                        {#each [90, 150, 210] as y, i}
                            <path
                                d="M 90 {y} Q 105 {y + 15}, 120 {y + 30}"
                                fill="none"
                                class="stroke-base-content transition-all ease-out"
                                style="
                                    stroke-width: 0.5;
                                    stroke-opacity: {dataHovered ? 0.2 : 0};
                                    stroke-dasharray: 50;
                                    stroke-dashoffset: {dataHovered ? 0 : 50};
                                    transition-duration: 500ms;
                                    transition-delay: {dataHovered ? 600 + i * 100 : 0}ms;
                                "
                            />
                        {/each}

                        <!-- Verified badge -->
                        <g
                            class="transition-all ease-out"
                            style="
                                opacity: {dataHovered ? 1 : 0};
                                transform: translateY({dataHovered ? 0 : 8}px);
                                transition-duration: 500ms;
                                transition-delay: {dataHovered ? 1000 : 0}ms;
                            "
                        >
                            <rect x="290" y="255" width="80" height="24" rx="12"
                                  class="fill-base-content" style="opacity: 0.05;" />
                            <text x="330" y="271" text-anchor="middle"
                                  class="fill-base-content font-mono"
                                  style="font-size: 10px; opacity: 0.35;">verified ✓</text>
                        </g>
                    </svg>
                </div>

                <!-- Content -->
                <div>
                    <h3 class="text-xl lg:text-2xl font-semibold text-base-content mb-2">
                        Verifiable & Auditable
                    </h3>
                    <p class="text-base-content/40 text-sm lg:text-base leading-relaxed">
                        Distribution data stored on IPFS. Every transaction cryptographically verified.
                    </p>
                </div>
            </div>
        </div>
    </div>
</section>
