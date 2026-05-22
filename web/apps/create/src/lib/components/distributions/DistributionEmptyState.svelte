<script lang="ts">
    import type { ComponentType } from "svelte";

    let {
        icon: Icon,
        title,
        description,
        color = "bg-zen-fg/5",
        iconColor = "text-zen-fg/20",
        action,
    }: {
        icon: ComponentType;
        title: string;
        description: string;
        color?: string;
        iconColor?: string;
        action?: any;
    } = $props();
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
    <p class="text-sm text-zen-fg-muted max-w-sm mb-6">
        {description}
    </p>
    {#if action}
        {@render action()}
    {/if}
</div>
