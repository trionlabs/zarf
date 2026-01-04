<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children?: Snippet;
        variant?: "primary" | "secondary" | "ghost" | "danger";
        size?: "sm" | "md" | "lg";
        class?: string;
        onclick?: (e: MouseEvent) => void;
        disabled?: boolean;
        type?: "button" | "submit" | "reset";
    }

    let {
        children,
        variant = "primary",
        size = "md",
        class: className = "",
        ...rest
    }: Props = $props();

    // Size classes
    const sizeClasses = {
        sm: "px-3 py-1.5 text-xs gap-1.5",
        md: "px-5 py-2.5 text-sm gap-2",
        lg: "px-6 py-3 text-base gap-2.5",
    };

    // Variant classes - Zen Pro aesthetic
    const variantClasses = {
        primary:
            "bg-base-content text-base-100 hover:bg-base-content/90 border-transparent",
        secondary:
            "bg-transparent text-base-content border-base-content/20 hover:border-base-content/40 hover:bg-base-content/5",
        ghost: "bg-transparent text-base-content/70 border-transparent hover:bg-base-content/5 hover:text-base-content",
        danger: "bg-transparent text-error/70 border-transparent hover:bg-error/10 hover:text-error",
    };

    const baseClasses =
        "inline-flex items-center justify-center font-medium rounded-full border transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none";
</script>

<button
    class="{baseClasses} {sizeClasses[size]} {variantClasses[
        variant
    ]} {className}"
    {...rest}
>
    {@render children?.()}
</button>
