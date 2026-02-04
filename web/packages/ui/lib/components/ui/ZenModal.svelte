<script lang="ts">
    import type { Snippet } from "svelte";
    import { X } from "lucide-svelte";

    interface Props {
        open?: boolean;
        onclose?: () => void;
        title?: Snippet;
        content?: Snippet;
        actions?: Snippet;
        closeOnBackdrop?: boolean;
        closeOnEscape?: boolean;
        showCloseButton?: boolean;
        class?: string;
        size?: "sm" | "md" | "lg" | "xl" | "full";
    }

    let {
        open = false,
        onclose,
        title,
        content,
        actions,
        closeOnBackdrop = true,
        closeOnEscape = true,
        showCloseButton = true,
        class: className = "",
        size = "md",
    }: Props = $props();

    const sizeClasses = {
        sm: "max-w-sm",
        md: "max-w-lg",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
        full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
    };

    function handleBackdropClick(e: MouseEvent) {
        if (closeOnBackdrop && e.target === e.currentTarget) {
            onclose?.();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (closeOnEscape && e.key === "Escape") {
            onclose?.();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
    <!-- Backdrop -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--zen-fg)]/50 backdrop-blur-sm animate-zen-fade-in"
        onclick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
    >
        <!-- Modal Box -->
        <div
            class="
                relative w-full {sizeClasses[size]}
                bg-zen-bg
                border-[0.5px] border-zen-border-subtle
                rounded-2xl
                shadow-[0_25px_50px_-12px_oklch(from_var(--zen-fg)_l_c_h_/_0.25)]
                animate-zen-scale-in
                overflow-hidden
                {className}
            "
        >
            <!-- Close Button -->
            {#if showCloseButton}
                <button
                    type="button"
                    class="absolute top-4 right-4 p-1 rounded-full text-zen-fg-subtle hover:text-zen-fg hover:bg-zen-fg/5 transition-colors z-10"
                    onclick={onclose}
                    aria-label="Close modal"
                >
                    <X class="w-5 h-5" />
                </button>
            {/if}

            <!-- Header -->
            {#if title}
                <div class="px-6 pt-6 pb-2">
                    {@render title()}
                </div>
            {/if}

            <!-- Content -->
            {#if content}
                <div class="px-6 py-4 overflow-y-auto max-h-[calc(100vh-16rem)]">
                    {@render content()}
                </div>
            {/if}

            <!-- Actions -->
            {#if actions}
                <div class="px-6 py-4 flex items-center justify-end gap-3 border-t border-zen-border-subtle">
                    {@render actions()}
                </div>
            {/if}
        </div>
    </div>
{/if}
