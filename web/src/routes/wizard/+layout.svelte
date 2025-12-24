<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { onMount } from "svelte";
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";
    import ContextPanel from "$lib/components/wizard/ContextPanel.svelte";

    let { children } = $props();

    onMount(() => {
        wizardStore.restore();
    });

    interface Step {
        id: number;
        label: string;
        match: (s: number) => boolean;
    }

    const mainSteps: Step[] = [
        { id: 1, label: "Configuration", match: (s: number) => s === 1 },
        { id: 2, label: "Distribution", match: (s: number) => s === 2 },
        { id: 3, label: "Deploy", match: (s: number) => s === 3 },
        { id: 4, label: "Success", match: (s: number) => s === 4 },
    ];

    let currentMainStep = $derived(
        mainSteps.find((s) => s.match(wizardStore.currentStep)) || mainSteps[0],
    );
</script>

<div
    class="min-h-screen bg-base-100 font-sans selection:bg-primary selection:text-primary-content flex flex-col"
>
    <!-- Header -->
    <header
        class="w-full border-b-[0.5px] border-base-content/10 bg-base-100/95 backdrop-blur-xl sticky top-0 z-50"
    >
        <div class="flex items-center justify-between h-14 px-8">
            <!-- Logo -->
            <a
                href="/"
                class="flex items-center gap-2.5 hover:opacity-70 transition-opacity"
            >
                <div
                    class="w-6 h-6 rounded-md flex items-center justify-center bg-base-content/5"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        class="w-3.5 h-3.5 stroke-current opacity-60"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                </div>
                <span class="text-sm font-semibold tracking-tight">Zarf</span>
            </a>

            <!-- Center: Breadcrumb-style Title -->
            <div class="hidden md:flex items-center gap-2 text-xs">
                <span class="text-base-content/30">Create Distribution</span>
                <span class="text-base-content/20">/</span>
                <span class="text-base-content/60 font-medium"
                    >Step {wizardStore.currentStep}</span
                >
            </div>

            <!-- Right: Nav + Theme -->
            <div class="flex items-center gap-6">
                <nav class="hidden md:flex items-center gap-5">
                    <a
                        href="/dashboard"
                        class="text-xs text-base-content/40 hover:text-base-content transition-colors"
                    >
                        Dashboard
                    </a>
                    <a
                        href="/docs"
                        class="text-xs text-base-content/40 hover:text-base-content transition-colors"
                    >
                        Docs
                    </a>
                </nav>
                <div class="border-l-[0.5px] border-base-content/10 pl-5">
                    <ThemeToggle />
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content: Full Width 3-Column Grid -->
    <div class="flex-1 grid grid-cols-1 lg:grid-cols-[200px_1fr_280px]">
        <!-- Left Sidebar (Steps) - Hidden on mobile -->
        <aside
            class="hidden lg:flex flex-col border-r-[0.5px] border-base-content/10 bg-base-100"
        >
            <div class="sticky top-16 p-8">
                <!-- Section Title -->
                <h3
                    class="text-[10px] font-semibold uppercase tracking-[0.15em] text-base-content/40 mb-5"
                >
                    Progress
                </h3>

                <div class="space-y-1">
                    {#each mainSteps as step}
                        {@const isActive = currentMainStep.id === step.id}
                        {@const isCompleted = currentMainStep.id > step.id}

                        <div
                            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group transition-all duration-300"
                        >
                            <div class="flex items-center gap-3">
                                <!-- Step Indicator -->
                                <div
                                    class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all duration-300 {isActive
                                        ? 'bg-primary text-primary-content'
                                        : isCompleted
                                          ? 'bg-success/20 text-success'
                                          : 'bg-base-content/5 text-base-content/30'}"
                                >
                                    {#if isCompleted}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="3"
                                            class="w-3 h-3"
                                        >
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    {:else}
                                        {step.id}
                                    {/if}
                                </div>

                                <!-- Label -->
                                <span
                                    class="text-xs transition-all duration-300 {isActive
                                        ? 'font-medium text-base-content'
                                        : isCompleted
                                          ? 'text-base-content/50 line-through'
                                          : 'text-base-content/40'}"
                                >
                                    {step.label}
                                </span>
                            </div>

                            <!-- Status indicator -->
                            {#if isActive}
                                <div
                                    class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
                                ></div>
                            {/if}
                        </div>
                    {/each}
                </div>

                <!-- Help Link -->
                <div class="mt-12 pt-6 border-t border-base-content/5">
                    <a
                        href="/docs"
                        class="text-xs font-medium flex items-center gap-2 opacity-40 hover:opacity-100 hover:text-primary transition-all"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-4 h-4"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                            />
                        </svg>
                        Need help?
                    </a>
                </div>
            </div>
        </aside>

        <!-- Mobile Horizontal Stepper -->
        <div
            class="lg:hidden border-b-[0.5px] border-base-content/10 p-4 bg-base-100"
        >
            <div class="flex items-center justify-center gap-3">
                {#each mainSteps as step}
                    {@const isActive = currentMainStep.id === step.id}
                    {@const isCompleted = currentMainStep.id > step.id}

                    <div class="flex items-center gap-3">
                        <div
                            class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium border transition-all {isActive
                                ? 'border-primary bg-primary text-primary-content'
                                : isCompleted
                                  ? 'border-success text-success'
                                  : 'border-base-content/20 opacity-40'}"
                        >
                            {#if isCompleted}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="3"
                                    class="w-3 h-3"
                                >
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            {:else}
                                {step.id}
                            {/if}
                        </div>

                        {#if step.id < 4}
                            <div
                                class="w-8 h-[1px] {isCompleted
                                    ? 'bg-success'
                                    : 'bg-base-content/10'}"
                            ></div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Main Content Area -->
        <main class="bg-base-100 relative">
            <div class="max-w-4xl px-6 md:px-12 pt-10 lg:pt-16">
                {@render children()}
            </div>
        </main>

        <!-- Right Context Panel - Hidden on mobile/tablet -->
        <aside
            class="hidden lg:block border-l-[0.5px] border-base-content/10 bg-base-50"
        >
            <div class="sticky top-16">
                <ContextPanel />
            </div>
        </aside>
    </div>
</div>
