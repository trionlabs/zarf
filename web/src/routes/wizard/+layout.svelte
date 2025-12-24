<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { onMount } from "svelte";
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";

    let { children } = $props();

    onMount(() => {
        wizardStore.restore();
    });

    const steps = [
        { num: 1, label: "Details" },
        { num: 2, label: "Schedule" },
        { num: 3, label: "Whitelist" },
        { num: 4, label: "Rules" },
        { num: 5, label: "Review" },
        { num: 6, label: "Complete" },
    ];
</script>

<div
    class="min-h-screen bg-base-200/50 font-sans selection:bg-primary selection:text-primary-content flex flex-col items-center py-6"
>
    <!-- Floating Header -->
    <div class="w-full max-w-5xl px-4 mb-12">
        <div
            class="navbar bg-base-100/80 backdrop-blur-md rounded-box shadow-sm border border-base-200/50"
        >
            <div class="navbar-start">
                <a
                    href="/"
                    class="btn btn-ghost text-xl tracking-tight font-bold gap-2"
                >
                    <div
                        class="w-8 h-8 rounded-lg bg-primary text-primary-content flex items-center justify-center"
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
                <ul class="menu menu-horizontal px-1">
                    <li>
                        <a href="/dashboard" class="font-medium">Dashboard</a>
                    </li>
                    <li>
                        <a href="/docs" class="font-medium opacity-70"
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

    <!-- Main Content Area -->
    <div class="w-full max-w-4xl px-4 flex flex-col items-center gap-10 flex-1">
        <!-- Stepper -->
        <div class="w-full max-w-3xl">
            <ul class="steps steps-horizontal w-full text-sm">
                {#each steps as step}
                    <li
                        class="step transition-all duration-300"
                        class:step-primary={wizardStore.currentStep >= step.num}
                        class:opacity-50={wizardStore.currentStep < step.num}
                        data-content={wizardStore.currentStep > step.num
                            ? "✓"
                            : step.num}
                    >
                        <span
                            class="font-medium tracking-wide text-xs uppercase mt-2"
                            >{step.label}</span
                        >
                    </li>
                {/each}
            </ul>
        </div>

        <!-- Main Card (DaisyUI Standard) -->
        <div
            class="card bg-base-100 w-full shadow-sm transition-all duration-300 ease-in-out"
        >
            <div class="card-body p-8 md:p-12">
                {@render children()}
            </div>
        </div>
    </div>
</div>
