<script lang="ts">
    import type { Snippet } from "svelte";
    import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-svelte";

    interface Props {
        children?: Snippet;
        title?: Snippet;
        actions?: Snippet;
        variant?: "info" | "success" | "warning" | "error";
        dismissible?: boolean;
        ondismiss?: () => void;
        class?: string;
    }

    let {
        children,
        title,
        actions,
        variant = "info",
        dismissible = false,
        ondismiss,
        class: className = "",
    }: Props = $props();

    const variantClasses = {
        info: "bg-zen-info-muted border-zen-info/20 text-zen-info-content",
        success: "bg-zen-success-muted border-zen-success/20 text-zen-success-content",
        warning: "bg-zen-warning-muted border-zen-warning/20 text-zen-warning-content",
        error: "bg-zen-error-muted border-zen-error/20 text-zen-error",
    };

    const iconClasses = {
        info: "text-zen-info",
        success: "text-zen-success",
        warning: "text-zen-warning",
        error: "text-zen-error",
    };

    const icons = {
        info: Info,
        success: CheckCircle,
        warning: AlertTriangle,
        error: AlertCircle,
    } as const;

    const Icon = $derived(icons[variant]);
</script>

<div
    class="
        relative flex gap-3 p-4
        rounded-[var(--zen-radius-xl)]
        border-[0.5px]
        {variantClasses[variant]}
        {className}
    "
    role="alert"
>
    <div class="shrink-0 {iconClasses[variant]}">
        <Icon class="w-5 h-5" />
    </div>

    <div class="flex-1 min-w-0">
        {#if title}
            <div class="font-semibold mb-1">
                {@render title()}
            </div>
        {/if}
        {#if children}
            <div class="text-sm opacity-90">
                {@render children()}
            </div>
        {/if}
    </div>

    {#if actions}
        <div class="shrink-0 flex items-center gap-2">
            {@render actions()}
        </div>
    {:else if dismissible}
        <button
            type="button"
            class="shrink-0 p-0.5 rounded hover:bg-[var(--zen-fg)]/5 transition-colors"
            onclick={ondismiss}
            aria-label="Dismiss"
        >
            <X class="w-4 h-4" />
        </button>
    {/if}
</div>
