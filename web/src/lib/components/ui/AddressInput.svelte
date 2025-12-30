<script lang="ts">
    import { Search, Clipboard, AlertCircle } from "lucide-svelte";

    let {
        value = $bindable(),
        placeholder = "0x...",
        error = null,
        onInput = () => {},
        isLoading = false,
        onAction = () => {},
        actionIcon: ActionIcon = null,
    } = $props<{
        value: string;
        placeholder?: string;
        error?: string | null;
        onInput?: () => void;
        isLoading?: boolean;
        onAction?: () => void; // Paste or Import
        actionIcon?: any; // Icon component
    }>();
</script>

<div class="form-control w-full space-y-2">
    <div
        class="join w-full shadow-sm hover:shadow-md transition-shadow duration-300"
    >
        <div
            class="join-item bg-base-200/30 flex items-center px-4 border border-base-content/10 border-r-0"
        >
            <Search class="w-4 h-4 text-base-content/40" />
        </div>
        <input
            type="text"
            {placeholder}
            class="input input-lg input-bordered join-item w-full font-mono text-base bg-base-100 focus:bg-base-100 border-base-content/10 focus:border-primary/50 text-base-content/80 placeholder:text-base-content/20 transition-all duration-300"
            class:input-error={error !== null}
            bind:value
            oninput={onInput}
            onkeydown={(e) => e.key === "Enter" && onAction()}
        />
        <button
            type="button"
            class="btn btn-lg join-item border-base-content/10 hover:border-primary/30 hover:bg-primary/5 text-base-content/40 hover:text-primary transition-all duration-300"
            onclick={onAction}
            disabled={isLoading}
        >
            {#if isLoading}
                <span class="loading loading-spinner loading-sm"></span>
            {:else if ActionIcon}
                <ActionIcon class="w-4 h-4" />
            {/if}
        </button>
    </div>

    {#if error}
        <div class="label pb-0 pl-1 animate-in slide-in-from-top-1">
            <span
                class="label-text-alt text-error flex items-center gap-1.5 font-medium"
            >
                <AlertCircle class="w-3.5 h-3.5" />
                {error}
            </span>
        </div>
    {/if}
</div>
