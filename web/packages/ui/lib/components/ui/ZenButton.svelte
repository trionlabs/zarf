<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";

    interface Props extends HTMLButtonAttributes {
        children?: Snippet;
        iconLeft?: Snippet;
        iconRight?: Snippet;
        variant?: "primary" | "secondary" | "ghost" | "danger";
        size?: "xs" | "sm" | "md" | "lg";
        loading?: boolean;
    }

    let {
        children,
        iconLeft,
        iconRight,
        variant = "primary",
        size = "md",
        loading = false,
        disabled,
        class: className = "",
        popover, // Destructure popover to exclude it from rest
        ...rest
    }: Props = $props();

    /**
     * SIZE CONFIGURATION
     * 4px base unit scale matching design tokens
     */
    const sizeClasses = {
        xs: "px-2.5 py-1 text-xs gap-1",
        sm: "px-4 py-2 text-xs gap-1.5", // Previously px-3 py-1.5
        md: "px-6 py-3 text-sm gap-2", // Previously px-5 py-2.5
        lg: "px-8 py-4 text-base gap-2.5", // Previously px-6 py-3
    } as const;

    const spinnerSizes = {
        xs: "w-3 h-3",
        sm: "w-4 h-4",
        md: "w-4 h-4",
        lg: "w-5 h-5",
    } as const;

    /**
     * VARIANT CONFIGURATION - "Porcelain & Precision" Token System
     *
     * Philosophy:
     * - Dark Mode ("Porcelain"): Glazed ceramic feel, dimmed at rest, glows on hover
     * - Light Mode ("Luxury Material"): Deep, solid, high-contrast
     *
     * State Matrix (via oklch lightness shifts):
     * - Idle: Dimmed/muted for elegant rest state
     * - Hover: Full expression (+10% L shift, glowing border)
     * - Active: Pressed depth (inset shadow, maintained text color)
     *
     * Design Rules:
     * - NO scale transforms (feels cheap)
     * - NO translate effects (unnecessary motion)
     * - NO opacity changes (use lightness/chroma shifts)
     * - Self-colored borders (same hue family as surface)
     */
    const variantClasses = {
        /** Primary: Main CTA - Porcelain/Charcoal surface, dramatic hover */
        primary: `
            bg-zen-btn-primary-bg text-zen-btn-primary-text
            hover:bg-zen-btn-primary-bg-hover hover:text-zen-btn-primary-text-hover
            active:bg-zen-btn-primary-bg-active active:text-zen-btn-primary-text-hover
            ring-1 ring-inset ring-zen-btn-primary-border
            hover:ring-zen-btn-primary-border-hover
            active:ring-zen-btn-primary-border-active
            shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_8px_-2px_rgba(0,0,0,0.12)]
            hover:shadow-[0_4px_8px_rgba(0,0,0,0.12),0_12px_24px_-4px_rgba(0,0,0,0.2)]
            active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.15)] active:translate-y-[1px]
        `,
        /** Secondary: Alternative paths - Transparent with visible border */
        secondary: `
            bg-zen-btn-secondary-bg text-zen-btn-secondary-text
            hover:bg-zen-btn-secondary-bg-hover hover:text-zen-btn-secondary-text-hover
            active:bg-zen-btn-secondary-bg-active active:text-zen-btn-secondary-text-hover
            ring-1 ring-inset ring-zen-btn-secondary-border
            hover:ring-zen-btn-secondary-border-hover
            active:ring-zen-btn-secondary-border-active
        `,
        /** Ghost: High-frequency, low-emphasis - Minimal, borderless */
        ghost: `
            bg-zen-btn-ghost-bg text-zen-btn-ghost-text
            hover:bg-zen-btn-ghost-bg-hover hover:text-zen-btn-ghost-text-hover
            active:bg-zen-btn-ghost-bg-active active:text-zen-btn-ghost-text-hover
            ring-0
        `,
        /** Danger: Destructive actions - Error-colored with subtle presence */
        danger: `
            bg-zen-btn-danger-bg text-zen-btn-danger-text
            hover:bg-zen-btn-danger-bg-hover hover:text-zen-btn-danger-text-hover
            active:bg-zen-btn-danger-bg-active active:text-zen-btn-danger-text-hover
            ring-1 ring-inset ring-zen-btn-danger-border
            hover:ring-zen-btn-danger-border-hover
            active:ring-zen-btn-danger-border-active
        `,
    } as const;

    const baseClasses = `
        inline-flex items-center justify-center relative
        font-semibold rounded-full
        tracking-[0.02em]
        tracking-[0.02em]
        transition-[background-color,box-shadow,transform,color] duration-200 ease-out
        active:duration-75
        disabled:opacity-50 disabled:pointer-events-none
        whitespace-nowrap
        cursor-pointer
    `;

    const isDisabled = $derived(disabled || loading);
</script>

<button
    class="{baseClasses} {sizeClasses[size]} {variantClasses[
        variant
    ]} {className}"
    data-variant={variant}
    disabled={isDisabled}
    aria-busy={loading || undefined}
    {...rest}
>
    <!-- Loading overlay: absolutely positioned to preserve button dimensions -->
    {#if loading}
        <span
            class="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
        >
            <svg
                class="animate-spin {spinnerSizes[size]}"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
            >
                <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                />
                <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
            </svg>
        </span>
    {/if}

    <!-- Content wrapper: invisible during loading to preserve layout -->
    <span
        class="inline-flex items-center justify-center"
        class:invisible={loading}
        style="gap: inherit;"
    >
        {#if iconLeft}
            <span class="shrink-0" aria-hidden="true">
                {@render iconLeft()}
            </span>
        {/if}

        {#if children}
            {@render children()}
        {/if}

        {#if iconRight}
            <span class="shrink-0" aria-hidden="true">
                {@render iconRight()}
            </span>
        {/if}
    </span>
</button>
