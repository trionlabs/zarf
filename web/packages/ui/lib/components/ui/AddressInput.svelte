<script lang="ts">
    import { Search, AlertCircle, Loader2 } from "lucide-svelte";
    import type { ComponentType } from "svelte";

    let {
        value = $bindable(),
        placeholder = "0x...",
        error = null,
        onInput = () => {},
        isLoading = false,
        onAction = () => {},
        actionIcon: ActionIcon = null,
        actionLabel = null,
    } = $props<{
        value: string;
        placeholder?: string;
        error?: string | null;
        onInput?: () => void;
        isLoading?: boolean;
        onAction?: () => void;
        actionIcon?: ComponentType | null;
        actionLabel?: string | null;
    }>();

    const hasError = $derived(error !== null);
</script>

<div class="w-full space-y-2">
    <!-- Input Group -->
    <div
        class="
            flex items-stretch w-full
            rounded-xl overflow-hidden
            border-[0.5px] transition-all duration-300
            bg-zen-bg
            {hasError
                ? 'border-zen-error/50'
                : 'border-zen-border hover:border-zen-border-strong focus-within:border-zen-primary/50'}
            shadow-sm hover:shadow-md focus-within:shadow-md
        "
    >
        <!-- Search Icon -->
        <div
            class="flex items-center justify-center px-4 bg-zen-fg/[0.02] border-r-[0.5px] border-zen-border-subtle"
        >
            <Search class="w-4 h-4 text-zen-fg-faint" />
        </div>

        <!-- Input -->
        <input
            type="text"
            {placeholder}
            class="
                flex-1 px-4 py-3.5
                bg-transparent
                font-mono text-sm
                text-zen-fg
                placeholder:text-zen-fg-faint
                focus:outline-none
                transition-colors duration-200
            "
            bind:value
            oninput={onInput}
            onkeydown={(e) => e.key === "Enter" && onAction()}
        />

        <!-- Action Button -->
        <button
            type="button"
            class="
                flex items-center justify-center gap-2 px-5
                bg-zen-fg/[0.02] hover:bg-zen-fg/[0.05]
                border-l-[0.5px] border-zen-border-subtle
                text-zen-fg-muted hover:text-zen-fg
                transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
            "
            onclick={onAction}
            disabled={isLoading}
        >
            {#if isLoading}
                <Loader2 class="w-4 h-4 animate-spin" />
            {:else if actionLabel}
                <span class="text-xs font-bold uppercase tracking-widest">{actionLabel}</span>
            {:else if ActionIcon}
                <ActionIcon class="w-4 h-4" />
            {/if}
        </button>
    </div>

    <!-- Error Message -->
    {#if error}
        <div class="flex items-center gap-1.5 pl-1 text-zen-error animate-zen-slide-up">
            <AlertCircle class="w-3.5 h-3.5 shrink-0" />
            <span class="text-xs font-medium">{error}</span>
        </div>
    {/if}
</div>
