<script lang="ts">
    import { toastStore, type Toast } from "../../stores/toastStore.svelte";
    import { fly } from "svelte/transition";
    import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from "lucide-svelte";

    // Icon Mapping
    const icons = {
        success: CheckCircle,
        error: AlertCircle,
        info: Info,
        warning: AlertTriangle
    };

    const colors = {
        success: "border-zen-success/20 bg-zen-success-muted text-zen-success",
        error: "border-zen-error/20 bg-zen-error-muted text-zen-error",
        info: "border-zen-info/20 bg-zen-info-muted text-zen-info",
        warning: "border-zen-warning/20 bg-zen-warning-muted text-zen-warning"
    };
</script>

{#if toastStore.toasts.length > 0}
<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 p-4">
    {#each toastStore.toasts as toast (toast.id)}
        {@const Icon = icons[toast.type]}

        <div
            class="
                flex items-start gap-3 p-4
                max-w-sm w-full
                rounded-xl border-[0.5px]
                shadow-lg backdrop-blur-md
                {colors[toast.type]}
            "
            transition:fly={{ y: 20, duration: 300 }}
            role="alert"
        >
            <div class="mt-0.5 shrink-0">
                <Icon class="w-5 h-5" />
            </div>

            <div class="flex-1 min-w-0">
                <span class="text-sm font-medium leading-tight block break-words">
                    {toast.message}
                </span>
            </div>

            <button
                class="
                    shrink-0 p-1 -mr-1 -mt-1
                    rounded-md opacity-60 hover:opacity-100
                    hover:bg-[var(--zen-fg)]/5
                    transition-opacity
                "
                onclick={() => toastStore.remove(toast.id)}
                aria-label="Close"
            >
                <X class="w-4 h-4" />
            </button>
        </div>
    {/each}
</div>
{/if}
