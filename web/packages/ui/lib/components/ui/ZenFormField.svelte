<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children?: Snippet;
        label?: string;
        hint?: string;
        error?: string | null;
        required?: boolean;
        class?: string;
    }

    let {
        children,
        label,
        hint,
        error = null,
        required = false,
        class: className = "",
    }: Props = $props();
</script>

<div class="w-full {className}">
    {#if label}
        <label class="block pb-1 pl-1 text-xs font-bold uppercase tracking-widest text-zen-fg-subtle">
            {label}
            {#if required}
                <span class="text-zen-error">*</span>
            {/if}
        </label>
    {/if}

    {@render children?.()}

    {#if error}
        <div class="pt-1 pl-1 text-xs font-medium text-zen-error animate-zen-slide-up">
            {error}
        </div>
    {:else if hint}
        <div class="pt-1 pl-1 text-xs text-zen-fg-subtle">
            {hint}
        </div>
    {/if}
</div>
