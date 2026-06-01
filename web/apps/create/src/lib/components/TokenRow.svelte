<script lang="ts">
    import type { RegistryToken } from '$lib/config/tokenRegistry';

    interface Props {
        /** A curated/known token row. */
        token?: RegistryToken;
        /** An import row for a pasted contract ID not in the registry. */
        importAddress?: string;
        onselect: () => void;
    }

    let { token, importAddress, onselect }: Props = $props();

    const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
</script>

<button
    type="button"
    onclick={onselect}
    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-zen-fg/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary focus-visible:ring-inset"
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
                {short(token.sacAddress)}
            </span>
        {:else if importAddress}
            <div class="font-medium text-zen-fg">Import token</div>
            <span class="block text-xs text-zen-fg-faint font-mono truncate">
                {short(importAddress)}
            </span>
        {/if}
    </div>

    <span class="text-[10px] uppercase tracking-widest text-zen-fg-faint shrink-0">
        {token ? 'Known' : 'Unverified'}
    </span>
</button>
