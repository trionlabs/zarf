<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        trigger?: Snippet;
        children?: Snippet;
        open?: boolean;
        position?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
        class?: string;
    }

    let {
        trigger,
        children,
        open = $bindable(false),
        position = "bottom-start",
        class: className = "",
    }: Props = $props();

    const positionClasses = {
        "bottom-start": "top-full left-0 mt-1",
        "bottom-end": "top-full right-0 mt-1",
        "top-start": "bottom-full left-0 mb-1",
        "top-end": "bottom-full right-0 mb-1",
    };

    function handleClickOutside(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (!target.closest(".zen-dropdown")) {
            open = false;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            open = false;
        }
    }
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="relative inline-block zen-dropdown {className}">
    <!-- Trigger -->
    <div onclick={() => (open = !open)} role="button" tabindex="0" onkeydown={(e) => e.key === "Enter" && (open = !open)}>
        {@render trigger?.()}
    </div>

    <!-- Dropdown Content -->
    {#if open}
        <div
            class="
                absolute z-50 min-w-48
                bg-zen-bg
                border-[0.5px] border-zen-border
                rounded-[var(--zen-radius-xl)]
                shadow-[0_10px_15px_-3px_oklch(from_var(--zen-fg)_l_c_h_/_0.1),0_4px_6px_-4px_oklch(from_var(--zen-fg)_l_c_h_/_0.1)]
                py-1
                animate-zen-slide-down
                {positionClasses[position]}
            "
        >
            {@render children?.()}
        </div>
    {/if}
</div>
