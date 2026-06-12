<script lang="ts">
    import type { RegistryToken } from '$lib/config/tokenRegistry';

    interface Props {
        id: string;
        /** A curated/known token row. */
        token?: RegistryToken;
        /** An import row for a pasted contract id / CODE:ISSUER asset. */
        importItem?: { title: string; subtitle: string };
        /** Keyboard-highlighted (aria-activedescendant target). */
        active: boolean;
        onselect: () => void;
        onhover: () => void;
    }

    let { id, token, importItem, active, onselect, onhover }: Props = $props();
</script>

<!-- Keyboard activation is handled by the combobox input (aria-activedescendant). -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    {id}
    role="option"
    tabindex={-1}
    aria-selected={active}
    onclick={onselect}
    onmouseenter={onhover}
    class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors {active
        ? 'bg-zen-fg/10'
        : ''}"
>
    {#if token?.iconUrl}
        <img src={token.iconUrl} alt="" class="w-7 h-7 rounded-full shrink-0" />
    {:else}
        <div
            class="w-7 h-7 rounded-full bg-zen-fg/10 flex items-center justify-center text-xs font-mono font-bold text-zen-fg-muted shrink-0"
        >
            {(token?.symbol ?? 'C').charAt(0)}
        </div>
    {/if}

    <div class="flex-1 min-w-0">
        {#if token}
            <div class="flex items-center gap-2">
                <span class="font-medium text-zen-fg truncate">{token.name}</span>
                <span class="text-xs text-zen-fg-faint shrink-0">{token.symbol}</span>
            </div>
            <span class="block text-xs text-zen-fg-faint font-mono truncate">
                {`${token.sacAddress.slice(0, 6)}…${token.sacAddress.slice(-4)}`}
            </span>
        {:else if importItem}
            <div class="font-medium text-zen-fg truncate">{importItem.title}</div>
            <span class="block text-xs text-zen-fg-faint font-mono truncate">
                {importItem.subtitle}
            </span>
        {/if}
    </div>

    <span class="text-[10px] uppercase tracking-widest text-zen-fg-faint shrink-0">
        {token ? 'Verified' : 'Unverified'}
    </span>
</div>
