<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";
    import { Check } from "lucide-svelte";

    interface Props extends HTMLInputAttributes {
        label?: string;
        checked?: boolean;
    }

    let {
        label,
        checked = $bindable(false),
        class: className = "",
        disabled,
        ...rest
    }: Props = $props();
</script>

<label class="flex items-center gap-2 cursor-pointer group {disabled ? 'opacity-50 cursor-not-allowed' : ''}">
    <div class="relative">
        <input
            type="checkbox"
            class="sr-only peer"
            bind:checked
            {disabled}
            {...rest}
        />
        <div
            class="
                w-4 h-4 rounded
                border-[0.5px] border-zen-border-strong
                bg-transparent
                transition-all duration-200
                peer-checked:bg-zen-primary
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
                <Check class="w-full h-full p-0.5 text-zen-primary-content" strokeWidth={3} />
            {/if}
        </div>
    </div>
    {#if label}
        <span class="text-xs text-zen-fg-muted group-hover:text-zen-fg transition-colors select-none">
            {label}
        </span>
    {/if}
</label>
