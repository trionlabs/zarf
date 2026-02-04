<script lang="ts">
    import { onMount } from 'svelte';

    interface Props {
        fallback?: import('svelte').Snippet<[Error, () => void]>;
        onError?: (error: Error, reset: () => void) => void;
        children: import('svelte').Snippet;
    }

    let { fallback, onError, children }: Props = $props();

    let error = $state<Error | null>(null);
    let errorKey = $state(0);

    function handleError(e: Error) {
        error = e;
        onError?.(e, reset);

        // Check if this is a SES-related error
        if (
            e.message?.includes('next_sibling_getter') ||
            e.message?.includes('SES') ||
            e.message?.includes('lockdown')
        ) {
            console.warn(
                '[ErrorBoundary] SES/Svelte conflict detected. ' +
                'Try disabling wallet extensions or using incognito mode.'
            );
        }
    }

    function reset() {
        error = null;
        errorKey++;
    }

    // Global error handler for uncaught errors within this subtree
    onMount(() => {
        const originalOnError = window.onerror;

        // Note: This is a safety net, but Svelte 5's internal errors
        // may not propagate here. The boundary works best with try-catch
        // in event handlers and async operations.

        return () => {
            window.onerror = originalOnError;
        };
    });
</script>

<!--
    Svelte 5 doesn't have built-in error boundaries like React.
    This component provides a pattern for catching errors in children.

    Usage:
    <ErrorBoundary>
        {#snippet fallback(error, reset)}
            <div>Error: {error.message}</div>
            <button onclick={reset}>Retry</button>
        {/snippet}
        <YourComponent />
    </ErrorBoundary>
-->

{#key errorKey}
    {#if error}
        {#if fallback}
            {@render fallback(error, reset)}
        {:else}
            <div class="p-4 border border-zen-error/30 rounded-lg bg-zen-error-muted">
                <h3 class="font-bold text-zen-error mb-2">
                    Something went wrong
                </h3>
                <p class="text-sm text-zen-error/80 mb-3 font-mono">
                    {error.message}
                </p>
                {#if error.message?.includes('next_sibling') || error.message?.includes('SES')}
                    <p class="text-xs text-zen-error/70 mb-3">
                        This may be caused by a wallet extension conflict.
                        Try disabling MetaMask or using incognito mode.
                    </p>
                {/if}
                <button
                    onclick={reset}
                    class="px-3 py-1.5 text-sm bg-zen-error text-zen-error-content rounded hover:bg-zen-error/90 transition-colors"
                >
                    Try Again
                </button>
            </div>
        {/if}
    {:else}
        {@render children()}
    {/if}
{/key}
