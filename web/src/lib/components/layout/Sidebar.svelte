<script lang="ts">
    import { page } from "$app/stores";
    import WizardSteps from "$lib/components/wizard/WizardSteps.svelte";

    import { authStore } from "$lib/stores/authStore.svelte";
    import {
        LayoutGrid,
        PlusCircle,
        HelpCircle,
        ChevronRight,
        List,
        Gift,
        type Icon,
    } from "lucide-svelte";
    import type { Component } from "svelte";

    let currentPath = $derived($page.url.pathname);

    interface NavItem {
        label: string;
        href: string;
        icon: typeof Icon;
        isActive: boolean;
        subComponent: Component | null;
        showSub: boolean;
    }

    // Modular Navigation Configuration
    let navItems = $derived.by<NavItem[]>(() => [
        {
            label: "Create",
            href: "/wizard/step-0",
            icon: PlusCircle,
            isActive: currentPath.startsWith("/wizard"),
            subComponent: WizardSteps,
            showSub: true, // Always show if active
        },
        {
            label: "Claim",
            href: "/claim",
            icon: Gift,
            isActive: currentPath.startsWith("/claim"),
            subComponent: null,
            showSub: false,
        },
        {
            label: "Distributions",
            href: "/distributions",
            icon: List,
            isActive: currentPath.startsWith("/distributions"),
            subComponent: null,
            showSub: false,
        },
    ]);

    // Clean Markup: Extract template logic to $derived
    function shouldShowSubNav(item: NavItem): boolean {
        return item.isActive && item.subComponent !== null && item.showSub;
    }

    const showClaimEmail = $derived(
        currentPath.startsWith("/claim") && Boolean(authStore.gmail.email),
    );
</script>

<aside
    class="hidden lg:flex flex-col w-56 bg-base-100 border-r border-base-content/5 shrink-0 h-full"
>
    <div class="flex flex-col h-full p-4">
        <!-- Section Label -->
        <div class="px-3 mb-4">
            <span
                class="text-[10px] font-bold uppercase tracking-[0.2em] text-base-content/30"
            >
                Workspace
            </span>
        </div>

        <!-- Primary Nav -->
        <nav class="space-y-1">
            {#each navItems as item (item.href)}
                <a
                    href={item.href}
                    aria-current={item.isActive ? "page" : undefined}
                    class="group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200
                    {item.isActive
                        ? 'bg-primary/5 text-primary font-medium'
                        : 'text-base-content/50 hover:bg-base-200/50 hover:text-base-content'}"
                >
                    <div class="flex items-center gap-3">
                        <item.icon
                            class="w-4 h-4 {item.isActive
                                ? 'text-primary'
                                : 'opacity-40 group-hover:opacity-70'}"
                        />
                        <span>{item.label}</span>
                    </div>
                    {#if item.isActive}
                        <ChevronRight class="w-3.5 h-3.5 opacity-40" />
                    {/if}
                </a>

                {#if shouldShowSubNav(item)}
                    <item.subComponent />
                {/if}
            {/each}
        </nav>

        <!-- Spacer -->
        <div class="flex-1"></div>

        <!-- Footer -->
        <div class="border-t border-base-content/5 pt-4 mt-4 space-y-2">
            {#if showClaimEmail}
                <div
                    class="px-3 py-2 rounded-lg bg-base-200/50 text-xs text-base-content/70 flex items-center gap-2 truncate"
                >
                    <div class="w-1.5 h-1.5 rounded-full bg-success"></div>
                    <span class="truncate" title={authStore.gmail.email}
                        >{authStore.gmail.email}</span
                    >
                </div>
            {/if}

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
