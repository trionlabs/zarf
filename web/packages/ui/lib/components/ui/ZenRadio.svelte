<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";

    interface Props extends HTMLInputAttributes {
        label?: string;
        description?: string;
        checked?: boolean;
        name: string;
        value: string;
    }

    let {
        label,
        description,
        checked = $bindable(false),
        name,
        value,
        class: className = "",
        disabled,
        ...rest
    }: Props = $props();
</script>

<label class="flex items-start gap-3 cursor-pointer group {disabled ? 'opacity-50 cursor-not-allowed' : ''}">
    <div class="relative mt-0.5">
        <input
            type="radio"
            class="sr-only peer"
            bind:checked
            {name}
            {value}
            {disabled}
            {...rest}
        />
        <div
            class="
                w-4 h-4 rounded-full
                border-[0.5px] border-zen-border-strong
                bg-transparent
                transition-all duration-200
                peer-checked:border-zen-primary
                peer-focus-visible:ring-2
                peer-focus-visible:ring-[var(--zen-ring-color)]
                peer-focus-visible:ring-offset-2
                peer-focus-visible:ring-offset-zen-bg
                group-hover:border-zen-fg-muted
                {className}
            "
        >
            {#if checked}
                <div class="absolute inset-1 rounded-full bg-zen-primary transition-transform scale-100"></div>
            {/if}
        </div>
    </div>
    {#if label || description}
        <div class="flex flex-col gap-0.5">
            {#if label}
                <span class="text-sm text-zen-fg group-hover:text-zen-fg transition-colors select-none font-medium">
                    {label}
                </span>
            {/if}
            {#if description}
                <span class="text-xs text-zen-fg-subtle select-none">
                    {description}
                </span>
            {/if}
        </div>
    {/if}
</label>
