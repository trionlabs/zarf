<script lang="ts">
    import { fade } from "svelte/transition";

    interface Props {
        text?: string;
        position?: "top" | "bottom" | "left" | "right";
        children?: import("svelte").Snippet;
    }

    let {
        text = "Coming Soon",
        position = "bottom",
        children,
    }: Props = $props();

    let isHovered = $state(false);
    let isFocused = $state(false);

    // Show tooltip on hover OR focus for keyboard accessibility
    let isVisible = $derived(isHovered || isFocused);
</script>

<div
    class="relative inline-block"
    role="group"
    onmouseenter={() => (isHovered = true)}
    onmouseleave={() => (isHovered = false)}
    onfocusin={() => (isFocused = true)}
    onfocusout={() => (isFocused = false)}
>
    {@render children?.()}

    {#if isVisible}
        <div
            role="tooltip"
            aria-live="polite"
            transition:fade={{ duration: 150 }}
            class="
                absolute z-50 px-3 py-1.5
                text-xs font-medium
                text-zen-bg bg-zen-fg
                rounded-lg shadow-lg
                whitespace-nowrap pointer-events-none
                {position === 'top'
                ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
                : position === 'bottom'
                  ? 'top-full left-1/2 -translate-x-1/2 mt-2'
                  : position === 'left'
                    ? 'right-full top-1/2 -translate-y-1/2 mr-2'
                    : 'left-full top-1/2 -translate-y-1/2 ml-2'}
            "
        >
            {text}
            <!-- Arrow -->
            <div
                class="
                    absolute w-2 h-2 bg-zen-fg rotate-45
                    {position === 'top'
                    ? 'top-full left-1/2 -translate-x-1/2 -mt-1'
                    : position === 'bottom'
                      ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1'
                      : position === 'left'
                        ? 'left-full top-1/2 -translate-y-1/2 -ml-1'
                        : 'right-full top-1/2 -translate-y-1/2 -mr-1'}
                "
            ></div>
        </div>
    {/if}
</div>
