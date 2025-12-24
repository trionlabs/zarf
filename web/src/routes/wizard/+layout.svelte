<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";
    import ContextPanel from "$lib/components/wizard/ContextPanel.svelte";
    import {
        LayoutGrid,
        PlusCircle,
        HelpCircle,
        ChevronRight,
    } from "lucide-svelte";

    let { children } = $props();

    onMount(() => {
        wizardStore.restore();
    });

    // Determine active section from URL
    let isManageView = $derived(page.url.pathname.startsWith("/manage"));
    let isCreateView = $derived(page.url.pathname.startsWith("/wizard"));
</script>

<div
    class="min-h-screen bg-base-200/30 font-sans selection:bg-primary selection:text-primary-content"
>
    <!-- Ultra-thin Top Bar -->
    <header
        class="h-12 bg-base-100 border-b border-base-content/5 flex items-center justify-between px-6 sticky top-0 z-50"
    >
        <!-- Logo -->
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
                class="text-sm font-semibold tracking-tight opacity-80 group-hover:opacity-100 transition-opacity"
                >Zarf</span
            >
        </a>

        <!-- Minimal Actions -->
        <div class="flex items-center gap-4">
            <a
                href="/docs"
                class="text-[11px] text-base-content/40 hover:text-base-content transition-colors uppercase tracking-widest font-medium"
            >
                Docs
            </a>
            <div class="w-px h-4 bg-base-content/10"></div>
            <ThemeToggle />
        </div>
    </header>

    <!-- Main Shell -->
    <div class="flex min-h-[calc(100vh-3rem)]">
        <!-- LEFT: Ultra-Slim Sidebar -->
        <aside
            class="hidden lg:flex flex-col w-56 bg-base-100 border-r border-base-content/5 shrink-0"
        >
            <div class="flex flex-col h-full p-4">
                <!-- Section Label -->
                <div class="px-3 mb-4">
                    <span
                        class="text-[10px] font-bold uppercase tracking-[0.2em] text-base-content/30"
                        >Workspace</span
                    >
                </div>

                <!-- Primary Nav -->
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

                <!-- Spacer -->
                <div class="flex-1"></div>

                <!-- Footer -->
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

        <!-- CENTER: Main Workspace -->
        <main class="flex-1 overflow-x-hidden">
            <!-- Inner Container with subtle inset feel -->
            <div class="h-full bg-base-100/50 lg:rounded-tl-2xl">
                <div class="w-full p-8 lg:p-12">
                    {@render children()}
                </div>
            </div>
        </main>

        <!-- RIGHT: Context Panel (Collapsible feeling) -->
        <aside
            class="hidden xl:block w-72 bg-base-100 border-l border-base-content/5 shrink-0"
        >
            <div class="sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
                <ContextPanel />
            </div>
        </aside>
    </div>

    <!-- Mobile Bottom Nav -->
    <nav
        class="lg:hidden fixed bottom-0 inset-x-0 bg-base-100/95 backdrop-blur-lg border-t border-base-content/10 z-50 safe-area-pb"
    >
        <div class="flex justify-around h-14">
            <a
                href="/wizard/step-0"
                class="flex flex-col items-center justify-center flex-1 gap-0.5 {isCreateView
                    ? 'text-primary'
                    : 'text-base-content/40'}"
            >
                <PlusCircle class="w-5 h-5" />
                <span class="text-[10px] font-medium">Create</span>
            </a>
            <a
                href="/manage"
                class="flex flex-col items-center justify-center flex-1 gap-0.5 {isManageView
                    ? 'text-primary'
                    : 'text-base-content/40'}"
            >
                <LayoutGrid class="w-5 h-5" />
                <span class="text-[10px] font-medium">Manage</span>
            </a>
        </div>
    </nav>
</div>

<style>
    /* Safe area for mobile notch/home indicator */
    .safe-area-pb {
        padding-bottom: env(safe-area-inset-bottom, 0);
    }
</style>
