<script lang="ts">
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { searchRegistry } from '$lib/config/tokenRegistry';
    import { isValidContractAddressShape } from '@zarf/core/utils/addressShape';
    import { focusTrap } from '@zarf/ui/actions/focusTrap';
    import { Search, X } from 'lucide-svelte';
    import TokenRow from './TokenRow.svelte';

    interface PickedToken {
        sacAddress: string;
        iconUrl?: string;
        symbol?: string;
    }

    interface Props {
        open: boolean;
        onclose: () => void;
        onselect: (token: PickedToken) => void;
    }

    let { open, onclose, onselect }: Props = $props();

    let query = $state('');
    let searchEl = $state<HTMLInputElement | undefined>(undefined);

    const baseId = $props.id();
    const titleId = `${baseId}-title`;

    const results = $derived(searchRegistry(networkStore.activeId, query));

    // A pasted contract ID that isn't already a curated result → offer to import.
    const importAddr = $derived.by(() => {
        const q = query.trim();
        if (!isValidContractAddressShape(q)) return null;
        return results.some((t) => t.sacAddress === q) ? null : q;
    });

    function close() {
        query = '';
        onclose();
    }

    function pick(token: PickedToken) {
        onselect(token);
        close();
    }

    function onSearchKeydown(e: KeyboardEvent) {
        // Enter commits the top item (import candidate first, else first result).
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (importAddr) {
            pick({ sacAddress: importAddr });
        } else if (results[0]) {
            const t = results[0];
            pick({ sacAddress: t.sacAddress, iconUrl: t.iconUrl, symbol: t.symbol });
        }
    }

    function handleBackdrop(e: MouseEvent) {
        if (e.target === e.currentTarget) close();
    }
</script>

{#if open}
    <!-- Keyboard semantics (Tab cycle + Escape) live in use:focusTrap. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="fixed inset-0 z-50 flex items-end justify-center bg-zen-scrim/50 backdrop-blur-sm animate-zen-fade-in sm:items-center sm:p-4"
        onclick={handleBackdrop}
        use:focusTrap={{ onEscape: close, initialFocus: () => searchEl ?? null, hideBackground: true }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabindex="-1"
    >
        <div
            class="flex w-full max-h-[85vh] flex-col rounded-t-2xl border-[0.5px] border-zen-border bg-zen-bg shadow-2xl animate-zen-scale-in sm:max-h-[70vh] sm:max-w-md sm:rounded-2xl"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-4 border-b-[0.5px] border-zen-border-subtle"
            >
                <h3 id={titleId} class="text-base font-semibold text-zen-fg">Select a token</h3>
                <button
                    class="p-1.5 rounded-lg text-zen-fg-muted hover:text-zen-fg hover:bg-zen-fg/5 transition-colors"
                    onclick={close}
                    aria-label="Close"
                >
                    <X class="w-4 h-4" />
                </button>
            </div>

            <!-- Search -->
            <div class="p-4 pb-2">
                <div class="relative">
                    <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-fg-faint pointer-events-none"
                    />
                    <input
                        bind:this={searchEl}
                        bind:value={query}
                        onkeydown={onSearchKeydown}
                        type="text"
                        placeholder="Search name or symbol, or paste a contract ID"
                        aria-label="Search tokens"
                        spellcheck="false"
                        autocomplete="off"
                        autocapitalize="none"
                        class="w-full rounded-xl border-[0.5px] border-zen-border-subtle bg-zen-fg/5 py-2.5 pl-9 pr-3 text-sm text-zen-fg placeholder:text-zen-fg-faint transition-colors focus:border-zen-primary/50 focus:outline-none"
                    />
                </div>
            </div>

            <!-- Results -->
            <div class="flex-1 overflow-y-auto px-2 pb-3" role="listbox" aria-label="Token results">
                {#if importAddr}
                    <TokenRow importAddress={importAddr} onselect={() => pick({ sacAddress: importAddr })} />
                {/if}
                {#each results as token (token.sacAddress)}
                    <TokenRow
                        {token}
                        onselect={() =>
                            pick({
                                sacAddress: token.sacAddress,
                                iconUrl: token.iconUrl,
                                symbol: token.symbol,
                            })}
                    />
                {/each}
                {#if !results.length && !importAddr}
                    <p class="text-center text-sm text-zen-fg-muted py-8 px-4">
                        {query.trim()
                            ? 'No known token matches. Paste a contract ID (C…) to import it.'
                            : 'No tokens configured for this network.'}
                    </p>
                {/if}
            </div>
        </div>
    </div>
{/if}
