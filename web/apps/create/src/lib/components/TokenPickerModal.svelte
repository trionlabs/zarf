<script lang="ts">
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { searchRegistry } from '$lib/config/tokenRegistry';
    import { parseTokenQuery, resolveSac } from '@zarf/core/utils/tokenAsset';
    import { getStellarConfig } from '@zarf/core/config/runtime';
    import { focusTrap } from '@zarf/ui/actions/focusTrap';
    import { Search, X, Loader2 } from 'lucide-svelte';
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
    let activeIndex = $state(0);
    let importError = $state<string | null>(null);
    let resolving = $state(false);

    const baseId = $props.id();
    const titleId = `${baseId}-title`;
    const listId = `${baseId}-list`;
    const optId = (i: number) => `${baseId}-opt-${i}`;
    const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

    const results = $derived(searchRegistry(networkStore.activeId, query));

    // An import candidate: a contract id or CODE:ISSUER asset not already curated.
    const importItem = $derived.by(() => {
        const parsed = parseTokenQuery(query);
        if (parsed.kind === 'contract') {
            if (results.some((t) => t.sacAddress === parsed.address)) return null;
            return {
                query: parsed.address,
                title: 'Import token',
                subtitle: short(parsed.address),
            };
        }
        if (parsed.kind === 'classic') {
            return {
                query: query.trim(),
                title: `Import ${parsed.code}`,
                subtitle: `${parsed.code}:${short(parsed.issuer)}`,
            };
        }
        return null;
    });

    // Flat, keyboard-navigable list: import row (if any) first, then results.
    const items = $derived([
        ...(importItem ? [{ kind: 'import' as const, ...importItem }] : []),
        ...results.map((token) => ({ kind: 'token' as const, token })),
    ]);

    // Keep the keyboard-highlighted option visible when arrowing through a list
    // taller than the viewport. block:'nearest' is a no-op when already in view
    // (e.g. on hover), so this is safe to run on every activeIndex change.
    $effect(() => {
        if (!items.length) return; // nothing to scroll to on an empty list
        document.getElementById(optId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    });

    function close() {
        query = '';
        activeIndex = 0;
        importError = null;
        onclose();
    }

    function pick(token: PickedToken) {
        onselect(token);
        close();
    }

    async function commitImport(q: string) {
        importError = null;
        resolving = true;
        try {
            const passphrase = getStellarConfig().networkPassphrase;
            if (!passphrase) throw new Error('Network is not configured.');
            const sacAddress = await resolveSac(q, passphrase);
            pick({ sacAddress });
        } catch (e) {
            importError = e instanceof Error ? e.message : 'Could not resolve that token.';
        } finally {
            resolving = false;
        }
    }

    function selectIndex(i: number) {
        const item = items[i];
        if (!item) return;
        if (item.kind === 'import') {
            if (resolving) return; // ignore Enter-spam while a resolve is in flight
            void commitImport(item.query);
        } else {
            pick({
                sacAddress: item.token.sacAddress,
                iconUrl: item.token.iconUrl,
                symbol: item.token.symbol,
            });
        }
    }

    function onSearchKeydown(e: KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length) activeIndex = Math.min(activeIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectIndex(activeIndex);
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
        use:focusTrap={{
            onEscape: close,
            initialFocus: () => searchEl ?? null,
            hideBackground: true,
        }}
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

            <!-- Search (combobox) -->
            <div class="p-4 pb-2">
                <div class="relative">
                    <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-fg-faint pointer-events-none"
                    />
                    <input
                        bind:this={searchEl}
                        bind:value={query}
                        oninput={() => {
                            activeIndex = 0;
                            importError = null;
                        }}
                        onkeydown={onSearchKeydown}
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-autocomplete="list"
                        aria-controls={listId}
                        aria-activedescendant={items.length ? optId(activeIndex) : undefined}
                        aria-label="Search tokens"
                        placeholder="Search name or symbol, or paste a contract ID"
                        spellcheck="false"
                        autocomplete="off"
                        autocapitalize="none"
                        class="w-full rounded-xl border-[0.5px] border-zen-border-subtle bg-zen-fg/5 py-2.5 pl-9 pr-3 text-sm text-zen-fg placeholder:text-zen-fg-faint transition-colors focus:border-zen-primary/50 focus:outline-none"
                    />
                </div>
                {#if importError}
                    <p role="alert" class="mt-2 px-1 text-xs text-zen-error">{importError}</p>
                {/if}
            </div>

            <!-- SR-only result count: the combobox's option list changes as the user
                 types, but a screen reader gets no count/empty feedback otherwise. -->
            <div class="sr-only" role="status" aria-live="polite">
                {#if query.trim()}
                    {results.length}
                    matching {results.length === 1 ? 'token' : 'tokens'}{importItem
                        ? '; press Enter to import the pasted address'
                        : '.'}
                {/if}
            </div>

            <!-- Results -->
            <div
                id={listId}
                class="flex-1 overflow-y-auto px-2 pb-3"
                role="listbox"
                aria-label="Token results"
            >
                {#each items as item, i (item.kind === 'import' ? 'import' : item.token.sacAddress)}
                    <TokenRow
                        id={optId(i)}
                        token={item.kind === 'token' ? item.token : undefined}
                        importItem={item.kind === 'import'
                            ? { title: item.title, subtitle: item.subtitle }
                            : undefined}
                        active={i === activeIndex}
                        onselect={() => selectIndex(i)}
                        onhover={() => (activeIndex = i)}
                    />
                {/each}
                {#if resolving}
                    <div
                        class="flex items-center justify-center gap-2 py-4 text-sm text-zen-fg-faint"
                    >
                        <Loader2 class="w-4 h-4 animate-spin" /> Resolving…
                    </div>
                {:else if !items.length}
                    <p class="text-center text-sm text-zen-fg-muted py-8 px-4">
                        {query.trim()
                            ? 'No known token. Paste a contract ID or CODE:ISSUER to import.'
                            : 'No tokens configured for this network.'}
                    </p>
                {/if}
            </div>
        </div>
    </div>
{/if}
