<script lang="ts">
    import ThemeSelector from "$lib/components/layout/ThemeSelector.svelte";
    import { Mail, ShieldCheck, Zap, Lock, Eye, EyeOff } from "lucide-svelte";

    let email = $state("");
    let isModalOpen = $state(false);
    let showPassword = $state(false);
    let isLoading = $state(false);

    function toggleModal() {
        isModalOpen = !isModalOpen;
    }

    async function handleAction() {
        isLoading = true;
        await new Promise((r) => setTimeout(r, 2000));
        isLoading = false;
        toggleModal();
    }
</script>

<svelte:head>
    <title>Zarf | Core UI Components</title>
</svelte:head>

<main class="min-h-screen bg-base-100 p-8 md:p-16">
    <div class="max-w-4xl mx-auto space-y-12">
        <!-- Header -->
        <header
            class="flex flex-col md:flex-row md:items-center justify-between gap-6"
        >
            <div class="space-y-4">
                <div class="flex gap-2">
                    <span class="badge badge-primary">Multi Theme</span>
                    <span class="badge badge-outline">DaisyUI v5</span>
                </div>
                <h1 class="text-5xl font-bold text-base-content">
                    ZARF<span class="text-primary">.</span>UI
                </h1>
                <p class="text-base-content/70 text-lg max-w-xl">
                    Pure DaisyUI components with theme switching.
                </p>
            </div>

            <ThemeSelector themes={["nord", "wireframe"]} />
        </header>

        <!-- Buttons -->
        <section class="space-y-4">
            <h2 class="text-2xl font-semibold text-base-content">Buttons</h2>
            <div class="flex flex-wrap gap-4">
                <button class="btn btn-primary">Primary</button>
                <button class="btn btn-secondary">Secondary</button>
                <button class="btn btn-accent">Accent</button>
                <button class="btn btn-neutral">Neutral</button>
                <button class="btn btn-ghost">Ghost</button>
                <button class="btn btn-outline">Outline</button>
                <button class="btn btn-error">Error</button>
            </div>
        </section>

        <!-- Inputs -->
        <section class="space-y-4">
            <h2 class="text-2xl font-semibold text-base-content">Inputs</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label class="form-control w-full">
                    <div class="label">
                        <span class="label-text">Email</span>
                    </div>
                    <input
                        type="email"
                        placeholder="yaman@zarf.io"
                        class="input input-bordered w-full"
                        bind:value={email}
                    />
                </label>

                <label class="form-control w-full">
                    <div class="label">
                        <span class="label-text">Password</span>
                    </div>
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        class="input input-bordered w-full"
                    />
                </label>

                <label class="form-control w-full">
                    <div class="label">
                        <span class="label-text">With Error</span>
                    </div>
                    <input
                        type="text"
                        placeholder="0x..."
                        class="input input-bordered input-error w-full"
                    />
                    <div class="label">
                        <span class="label-text-alt text-error"
                            >Verification pending</span
                        >
                    </div>
                </label>

                <label class="form-control w-full">
                    <div class="label">
                        <span class="label-text">Search</span>
                    </div>
                    <input
                        type="text"
                        placeholder="Search keys..."
                        class="input input-bordered w-full"
                    />
                </label>
            </div>
        </section>

        <!-- Badges -->
        <section class="space-y-4">
            <h2 class="text-2xl font-semibold text-base-content">Badges</h2>
            <div class="flex flex-wrap gap-3">
                <span class="badge badge-primary">Primary</span>
                <span class="badge badge-secondary">Secondary</span>
                <span class="badge badge-accent">Accent</span>
                <span class="badge badge-neutral">Neutral</span>
                <span class="badge badge-success">Success</span>
                <span class="badge badge-warning">Warning</span>
                <span class="badge badge-error">Error</span>
                <span class="badge badge-outline">Outline</span>
            </div>
        </section>

        <!-- Card -->
        <section class="space-y-4">
            <h2 class="text-2xl font-semibold text-base-content">Card</h2>
            <div class="card bg-base-200">
                <div class="card-body">
                    <h3 class="card-title">Card Title</h3>
                    <p class="text-base-content/70">
                        This is a standard DaisyUI card. Try switching themes!
                    </p>
                    <div class="card-actions justify-end">
                        <button class="btn btn-primary" onclick={toggleModal}
                            >Open Modal</button
                        >
                    </div>
                </div>
            </div>
        </section>

        <!-- Modal -->
        <dialog class="modal" class:modal-open={isModalOpen}>
            <div class="modal-box">
                <h3 class="text-lg font-bold">Modal Title</h3>
                <p class="py-4 text-base-content/70">
                    This is a standard DaisyUI modal.
                </p>
                <div class="modal-action">
                    <button class="btn btn-ghost" onclick={toggleModal}
                        >Close</button
                    >
                    <button
                        class="btn btn-primary"
                        onclick={handleAction}
                        disabled={isLoading}
                    >
                        {#if isLoading}
                            <span class="loading loading-spinner loading-sm"
                            ></span>
                        {/if}
                        Confirm
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button onclick={toggleModal}>close</button>
            </form>
        </dialog>
    </div>
</main>
