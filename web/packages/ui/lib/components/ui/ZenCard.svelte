<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children?: Snippet;
        class?: string;
        variant?: "glass" | "elevated" | "bordered";
        interactive?: boolean;
        padding?: "none" | "sm" | "md" | "lg";
        radius?: "none" | "md" | "lg" | "xl" | "2xl" | "3xl";
        onclick?: (e: MouseEvent) => void;
        onkeydown?: (e: KeyboardEvent) => void;
        role?: string;
        tabindex?: number;
    }

    let {
        children,
        class: className = "",
        variant = "glass",
        interactive = false,
        padding = "none",
        radius = "2xl",
        ...rest
    }: Props = $props();

    const variantClasses = {
        glass: `
            bg-[oklch(from_var(--zen-bg-elevated)_l_c_h_/_var(--zen-glass-bg-opacity,0.85))]
            backdrop-blur-[var(--zen-glass-blur,24px)]
            border-[0.5px] border-zen-glass-border
            shadow-[var(--zen-shadow-glass)]
        `,
        elevated: `
            bg-zen-bg-elevated
            border-[0.5px] border-zen-border-subtle
            shadow-[var(--zen-shadow-elevated)]
        `,
        bordered: `
            bg-transparent
            border-[0.5px] border-zen-border
        `,
    };

    const radiusClasses = {
        none: "rounded-none",
        md: "rounded-md",
        lg: "rounded-lg",
        xl: "rounded-xl",
        "2xl": "rounded-2xl",
        "3xl": "rounded-3xl",
    } as const;

    const paddingClasses = {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
    } as const;

    const interactiveClasses = $derived(
        interactive
            ? "cursor-pointer transition-all duration-300 hover:border-zen-border-strong hover:shadow-[var(--zen-shadow-lg)]"
            : ""
    );
</script>

<div
    class="group w-full {radiusClasses[radius]} {paddingClasses[padding]} {variantClasses[variant]} {interactiveClasses} {className}"
    {...rest}
>
    {@render children?.()}
</div>
