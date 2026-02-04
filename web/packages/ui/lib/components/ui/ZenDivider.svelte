<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children?: Snippet;
        vertical?: boolean;
        class?: string;
    }

    let {
        children,
        vertical = false,
        class: className = "",
    }: Props = $props();
</script>

{#if children}
    <div
        class="
            flex items-center gap-4
            {vertical ? 'flex-col' : 'flex-row'}
            {className}
        "
    >
        <div
            class="
                bg-zen-border
                {vertical ? 'w-[0.5px] flex-1' : 'h-[0.5px] flex-1'}
            "
        />
        <span class="text-xs text-zen-fg-subtle uppercase tracking-wider shrink-0">
            {@render children()}
        </span>
        <div
            class="
                bg-zen-border
                {vertical ? 'w-[0.5px] flex-1' : 'h-[0.5px] flex-1'}
            "
        />
    </div>
{:else}
    <div
        class="
            bg-zen-border
            {vertical ? 'w-[0.5px] h-full min-h-4' : 'h-[0.5px] w-full'}
            {className}
        "
    />
{/if}
