<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children?: Snippet;
        variant?: "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info";
        size?: "sm" | "md" | "lg";
        class?: string;
    }

    let {
        children,
        variant = "default",
        size = "md",
        class: className = "",
    }: Props = $props();

    const sizeClasses = {
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-2 py-0.5 text-xs",
        lg: "px-2.5 py-1 text-sm",
    };

    const variantClasses = {
        default: "bg-zen-fg/10 text-zen-fg-muted",
        primary: "bg-zen-primary/10 text-zen-primary",
        secondary: "bg-zen-secondary text-zen-secondary-content",
        success: "bg-zen-success-muted text-zen-success",
        warning: "bg-zen-warning-muted text-zen-warning-content",
        error: "bg-zen-error-muted text-zen-error",
        info: "bg-zen-info-muted text-zen-info-content",
    };
</script>

<span
    class="
        inline-flex items-center justify-center
        font-medium rounded-md
        {sizeClasses[size]}
        {variantClasses[variant]}
        {className}
    "
>
    {@render children?.()}
</span>
