<script lang="ts">
    import { walletStore } from "../../stores/walletStore.svelte";
</script>

{#if walletStore.isConnected}
    <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zen-fg/5 text-xs font-mono text-zen-fg-muted">
        <span class="w-1.5 h-1.5 rounded-full bg-zen-success"></span>
        <span>{walletStore.shortAddress}</span>
    </div>
{/if}
