<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { page } from "$app/state";
    import { onMount } from "svelte";
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";
    import WalletConnectButton from "$lib/components/layout/WalletConnectButton.svelte";
    import {
        LayoutGrid,
        PlusCircle,
        HelpCircle,
        ChevronRight,
        List,
    } from "lucide-svelte";

    let { children } = $props();

    onMount(() => {
        wizardStore.restore();
    });

    let isManageView = $derived(page.url.pathname.startsWith("/manage"));
    let isCreateView = $derived(page.url.pathname.startsWith("/wizard"));
    let isDistributionsView = $derived(
        page.url.pathname.startsWith("/distributions"),
    );
</script>

<div
    class="min-h-screen bg-base-200/30 font-sans selection:bg-primary selection:text-primary-content"
>
    <!-- Top Bar -->
    <header
        class="h-12 bg-base-100 border-b border-base-content/5 flex items-center justify-between px-6 sticky top-0 z-50"
    >
        <a href="/" class="flex items-center gap-2 group">
            <div
                class="w-5 h-5 rounded bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    class="w-3 h-3 stroke-primary-content"
                    stroke-width="2.5"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                </svg>
            </div>
            <span
                class="text-sm font-semibold tracking-tight group-hover:text-primary transition-colors"
                >Zarf</span
            >
        </a>

        <div class="flex items-center gap-3">
            <a
                href="/docs"
                class="text-xs text-base-content/40 hover:text-base-content transition-colors"
            >
                Docs
            </a>
            <div class="w-px h-4 bg-base-content/10"></div>
            <WalletConnectButton />
            <div class="w-px h-4 bg-base-content/10"></div>
            <ThemeToggle />
        </div>
    </header>

    <!-- Main Layout -->
    <div class="flex">
        <!-- Sidebar -->
        <aside
            class="hidden lg:flex flex-col w-56 bg-base-100 border-r border-base-content/5 shrink-0 sticky top-12 h-[calc(100vh-3rem)]"
        >
            <div class="flex-1 p-4 space-y-6">
                <div
                    class="text-[10px] font-bold uppercase tracking-widest text-base-content/30 px-3"
                >
                    Workspace
                </div>

                <nav class="space-y-1">
                    <a
                        href="/wizard/step-0"
                        class="group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200 {isCreateView
                            ? 'bg-primary/5 text-primary font-medium'
                            : 'text-base-content/50 hover:bg-base-200/50 hover:text-base-content'}"
                    >
                        <div class="flex items-center gap-3">
                            <PlusCircle
                                class="w-4 h-4 {isCreateView
                                    ? 'text-primary'
                                    : 'opacity-40 group-hover:opacity-70'}"
                            />
                            <span>Create</span>
                        </div>
                        {#if isCreateView}
                            <ChevronRight class="w-3.5 h-3.5 opacity-40" />
                        {/if}
                    </a>

                    <a
                        href="/distributions"
                        class="group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200 {isDistributionsView
                            ? 'bg-primary/5 text-primary font-medium'
                            : 'text-base-content/50 hover:bg-base-200/50 hover:text-base-content'}"
                    >
                        <div class="flex items-center gap-3">
                            <List
                                class="w-4 h-4 {isDistributionsView
                                    ? 'text-primary'
                                    : 'opacity-40 group-hover:opacity-70'}"
                            />
                            <span>Distributions</span>
                        </div>
                        {#if isDistributionsView}
                            <ChevronRight class="w-3.5 h-3.5 opacity-40" />
                        {/if}
                    </a>

                    <a
                        href="/manage"
                        class="group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200 {isManageView
                            ? 'bg-primary/5 text-primary font-medium'
                            : 'text-base-content/50 hover:bg-base-200/50 hover:text-base-content'}"
                    >
                        <div class="flex items-center gap-3">
                            <LayoutGrid
                                class="w-4 h-4 {isManageView
                                    ? 'text-primary'
                                    : 'opacity-40 group-hover:opacity-70'}"
                            />
                            <span>Manage</span>
                        </div>
                        {#if isManageView}
                            <ChevronRight class="w-3.5 h-3.5 opacity-40" />
                        {/if}
                    </a>
                </nav>

                <div class="flex-1"></div>

                <div class="border-t border-base-content/5 pt-4 mt-4">
                    <a
                        href="/docs"
                        class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-base-content/30 hover:text-base-content/60 hover:bg-base-200/30 transition-all"
                    >
                        <HelpCircle class="w-3.5 h-3.5" />
                        <span>Help Center</span>
                    </a>
                </div>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 overflow-x-hidden">
            <div class="h-full bg-base-100/50 lg:rounded-tl-2xl">
                {@render children()}
            </div>
        </main>
    </div>
</div>
