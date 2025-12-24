<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { onMount } from "svelte";
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";

    let { children } = $props();

    onMount(() => {
        wizardStore.restore();
    });

    const mainSteps = [
        {
            id: 1,
            label: "Configuration",
            match: (s) => s === 1,
        },
        {
            id: 2,
            label: "Distribution",
            match: (s) => s === 2,
        },
        {
            id: 3,
            label: "Deploy",
            match: (s) => s === 3,
        },
        {
            id: 4,
            label: "Success",
            match: (s) => s === 4,
        },
    ];

    let currentMainStep = $derived(
        mainSteps.find((s) => s.match(wizardStore.currentStep)) || mainSteps[0],
    );
</script>

<div
    class="min-h-screen bg-base-200/30 font-sans selection:bg-primary selection:text-primary-content flex flex-col items-center"
>
    <!-- Ultra Minimal Top Header -->
    <div
        class="w-full px-6 md:px-12 flex justify-center border-b-[0.5px] border-base-content/5 bg-base-100/50 backdrop-blur-xl sticky top-0 z-50"
    >
        <div class="navbar bg-transparent min-h-[4rem] p-0 w-full max-w-7xl">
            <div class="navbar-start">
                <a
                    href="/"
                    class="btn btn-ghost text-xl tracking-tight font-bold gap-2 pl-0 hover:bg-transparent"
                >
                    <div
                        class="w-8 h-8 rounded-lg flex items-center justify-center text-primary bg-primary/10"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            class="w-5 h-5 stroke-current"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                            ></path></svg
                        >
                    </div>
                    Zarf
                </a>
            </div>
            <div class="navbar-center hidden md:flex">
                <ul class="menu menu-horizontal px-1 gap-8">
                    <li>
                        <a
                            href="/dashboard"
                            class="text-sm font-medium opacity-60 hover:opacity-100 hover:bg-transparent transition-all"
                            >Dashboard</a
                        >
                    </li>
                    <li>
                        <a
                            href="/docs"
                            class="text-sm font-medium opacity-60 hover:opacity-100 hover:bg-transparent transition-all"
                            >Documentation</a
                        >
                    </li>
                </ul>
            </div>
            <div class="navbar-end">
                <ThemeToggle />
            </div>
        </div>
    </div>

    <!-- Floating Console Layout -->
    <div class="w-full px-6 md:px-12 flex justify-center py-8 flex-1">
        <div class="w-full max-w-7xl flex flex-col flex-1">
            <div
                class="card lg:card-side bg-base-100/60 backdrop-blur-3xl shadow-sm overflow-hidden border-[0.5px] border-base-content/10 min-h-[600px] flex-1 rounded-3xl"
            >
                <!-- Left Sidebar (Navigation) -->
                <div
                    class="bg-base-100/30 w-full lg:w-64 p-8 flex flex-col border-r-[0.5px] border-base-content/10"
                >
                    <div class="flex flex-col gap-8 mt-4">
                        <!-- Brand/Logo area could go here if not in header, but for now just steps -->
                        <div class="flex flex-col gap-1 relative">
                            <!-- Continuous Line (Optional, maybe too busy for Zen? Let's skip for ultra-minimal) -->

                            {#each mainSteps as step}
                                {@const isActive =
                                    currentMainStep.id === step.id}
                                {@const isCompleted =
                                    currentMainStep.id > step.id}

                                <div
                                    class="group flex items-center gap-4 px-2 py-3 transition-all duration-500 cursor-default"
                                    class:opacity-100={isActive}
                                    class:opacity-40={!isActive && !isCompleted}
                                    class:opacity-60={isCompleted}
                                >
                                    <!-- Step Indicator -->
                                    <div
                                        class="relative flex items-center justify-center"
                                    >
                                        <div
                                            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-500 border"
                                            class:border-primary={isActive}
                                            class:text-primary={isActive}
                                            class:bg-primary={isActive}
                                            class:text-primary-content={isActive}
                                            class:border-success={isCompleted}
                                            class:text-success={isCompleted}
                                            class:bg-transparent={!isActive}
                                            class:border-current={!isActive &&
                                                !isCompleted}
                                        >
                                            {#if isCompleted}
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="3"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    class="w-3 h-3"
                                                >
                                                    <polyline
                                                        points="20 6 9 17 4 12"
                                                    ></polyline>
                                                </svg>
                                            {:else}
                                                {step.id}
                                            {/if}
                                        </div>

                                        <!-- Active Glow Effect -->
                                        {#if isActive}
                                            <div
                                                class="absolute inset-0 bg-primary/20 blur-xl rounded-full"
                                            ></div>
                                        {/if}
                                    </div>

                                    <!-- Label -->
                                    <span
                                        class="text-sm font-medium tracking-wide transition-all duration-300"
                                        class:translate-x-1={isActive}
                                        class:text-primary={isActive}
                                    >
                                        {step.label}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <div
                        class="mt-auto pt-8 border-t border-base-content/5 opacity-40 hover:opacity-100 transition-opacity"
                    >
                        <a
                            href="/docs"
                            class="text-xs font-medium flex items-center gap-2 hover:text-primary transition-colors"
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
                                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                                />
                            </svg>
                            Need help?
                        </a>
                    </div>
                </div>

                <!-- Right Content Area -->
                <div class="card-body p-8 lg:p-12 w-full bg-base-100 relative">
                    {@render children()}
                </div>
            </div>
        </div>
    </div>
</div>
