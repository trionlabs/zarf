<script lang="ts">
    import type { Snippet } from "svelte";

    let { title, description, extra } = $props<{
        title: string;
        description: string;
        extra?: Snippet;
    }>();
</script>

<header class="mb-10 text-left">
    <div class="flex items-center justify-between">
        <div>
            <h1
                class="text-3xl font-light tracking-tight mb-3 text-base-content"
            >
                {title}
            </h1>
            <p
                class="text-base text-base-content/50 font-light leading-relaxed"
            >
                {description}
            </p>
        </div>
        {#if extra}
            {@render extra()}
        {/if}
    </div>
</header>
