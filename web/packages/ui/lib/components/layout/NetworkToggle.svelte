<script lang="ts">
    import { networkStore } from '../../stores/networkStore.svelte';
    import type { StellarNetworkId } from '@zarf/core/config/runtime';

    let pendingId = $state<StellarNetworkId | null>(null);
    const visibleOptions = $derived(networkStore.options);

    function select(id: StellarNetworkId) {
        if (id === networkStore.activeId || pendingId) return;
        pendingId = id;
        networkStore.select(id, { reload: true });
    }
</script>

{#if visibleOptions.length > 1}
    <div
        class="h-8 grid grid-cols-2 rounded-md border border-zen-border-subtle bg-zen-fg/[0.03] p-0.5"
        role="radiogroup"
        aria-label="Stellar network"
    >
        {#each visibleOptions as option}
            <button
                type="button"
                role="radio"
                aria-checked={networkStore.activeId === option.id}
                disabled={!option.configured || pendingId !== null}
                class="min-w-16 h-7 px-2 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 {networkStore.activeId ===
                option.id
                    ? 'bg-zen-fg text-zen-bg shadow-sm'
                    : 'text-zen-fg-muted hover:text-zen-fg hover:bg-zen-fg/5'}"
                onclick={() => select(option.id)}
            >
                {option.label}
            </button>
        {/each}
    </div>
{/if}
