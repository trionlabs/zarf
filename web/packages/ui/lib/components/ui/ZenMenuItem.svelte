<script lang="ts">
    import type { Snippet, ComponentType } from "svelte";

    interface Props {
        children?: Snippet;
        icon?: ComponentType;
        disabled?: boolean;
        active?: boolean;
        onclick?: (e: MouseEvent) => void;
        href?: string;
        class?: string;
    }

    let {
        children,
        icon: Icon,
        disabled = false,
        active = false,
        onclick,
        href,
        class: className = "",
    }: Props = $props();

    const baseClasses = `
        flex items-center gap-2 px-3 py-2 mx-1
        text-sm rounded-[var(--zen-radius-md)]
        transition-colors cursor-pointer
        text-zen-fg-muted
        hover:bg-zen-fg/5
        hover:text-zen-fg
    `;

    const activeClasses = active
        ? "bg-zen-fg/10 text-zen-fg font-medium"
        : "";

    const disabledClasses = disabled
        ? "opacity-50 cursor-not-allowed pointer-events-none"
        : "";
</script>

<li role="menuitem">
    {#if href && !disabled}
        <a
            {href}
            class="{baseClasses} {activeClasses} {className}"
            {onclick}
        >
            {#if Icon}
                <Icon class="w-4 h-4 shrink-0" />
            {/if}
            {@render children?.()}
        </a>
    {:else}
        <button
            type="button"
            class="{baseClasses} {activeClasses} {disabledClasses} {className} w-full text-left"
            {disabled}
            {onclick}
        >
            {#if Icon}
                <Icon class="w-4 h-4 shrink-0" />
            {/if}
            {@render children?.()}
        </button>
    {/if}
</li>
