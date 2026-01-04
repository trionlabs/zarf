<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children?: Snippet;
        class?: string;
        onclick?: (e: MouseEvent) => void;
        onkeydown?: (e: KeyboardEvent) => void;
        role?: string;
        tabindex?: number;
    }

    let { children, class: className = "", ...rest }: Props = $props();
</script>

<div
    class="group w-full text-left card bg-base-100/30 backdrop-blur-md border border-base-content/5 hover:border-base-content/10 hover:shadow-sm hover:-translate-y-px transition-all duration-300 cursor-pointer rounded-2xl {className}"
    {...rest}
>
    {@render children?.()}
</div>
