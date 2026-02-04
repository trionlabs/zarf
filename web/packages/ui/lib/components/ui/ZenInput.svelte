<script lang="ts">
    import type { ComponentType } from "svelte";
    import type { HTMLInputAttributes } from "svelte/elements";

    interface Props extends HTMLInputAttributes {
        label?: string;
        error?: string | null;
        icon?: ComponentType;
        containerClass?: string;
        tag?: "input" | "textarea";
        variant?: "bordered" | "ghost";
    }

    let {
        label,
        error = null,
        icon: Icon,
        containerClass = "",
        class: className = "",
        value = $bindable(),
        tag = "input",
        variant = "bordered",
        ...rest
    }: Props = $props();

    const baseInputClasses = `
        w-full transition-all duration-200
        text-zen-fg placeholder:text-zen-fg-subtle
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none
    `;

    const variantClasses = {
        bordered: `
            bg-[oklch(from_var(--zen-bg)_l_c_h_/_0.5)]
            border-[0.5px] border-zen-border
            rounded-[var(--zen-radius-input)]
            px-4 py-3
            hover:border-zen-border-strong
            hover:bg-zen-bg
            focus:bg-zen-bg
            focus:border-[oklch(from_var(--zen-primary)_l_c_h_/_0.5)]
        `,
        ghost: `
            bg-transparent border-none px-0
            hover:bg-zen-fg/[0.02]
            focus:bg-transparent
        `,
    };

    const errorClasses = $derived(
        error
            ? "border-zen-error text-zen-error"
            : ""
    );
</script>

<div class="w-full {containerClass}">
    {#if label}
        <label class="block pb-1 pl-1 text-xs font-bold uppercase tracking-widest text-zen-fg-subtle">
            {label}
        </label>
    {/if}

    <div class="relative group">
        {#if Icon && tag === "input"}
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-zen-fg-faint group-focus-within:text-zen-primary transition-colors pointer-events-none">
                <Icon class="w-5 h-5" />
            </div>
        {/if}

        {#if tag === "input"}
            <input
                class="{baseInputClasses} {variantClasses[variant]} {errorClasses} {Icon ? 'pl-12' : ''} {className}"
                bind:value
                {...rest}
            />
        {:else}
            <textarea
                class="{baseInputClasses} {variantClasses[variant]} {errorClasses} resize-none min-h-24 {className}"
                bind:value
                {...rest as any}
            ></textarea>
        {/if}
    </div>

    {#if error}
        <div class="pt-1 pl-1 text-xs font-medium text-zen-error animate-zen-slide-up">
            {error}
        </div>
    {/if}
</div>
