<script lang="ts">
    import type { ComponentType } from "svelte";
    import type { Snippet } from "svelte";

    let {
        icon: Icon,
        title,
        description,
        color = "bg-base-content/5",
        iconColor = "text-base-content/20",
        action,
    } = $props<{
        icon: ComponentType;
        title: string;
        description: string;
        color?: string;
        iconColor?: string;
        action?: Snippet;
    }>();
</script>

<div
    class="flex flex-col items-center justify-center py-16 text-center animate-in fade-in zoom-in duration-300"
>
    <div
        class="w-16 h-16 rounded-full flex items-center justify-center mb-4 {color}"
    >
        <Icon class="w-8 h-8 {iconColor}" />
    </div>
    <h3 class="font-medium text-lg mb-2">
        {title}
    </h3>
    <p class="text-sm text-base-content/50 max-w-sm mb-6">
        {description}
    </p>
    {#if action}
        {@render action()}
    {/if}
</div>
