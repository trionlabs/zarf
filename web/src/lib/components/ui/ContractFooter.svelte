<script lang="ts">
    import { page } from "$app/stores";
    import { Copy, Check } from "lucide-svelte";
    
    const contracts = [
        { name: "My Vesting", address: "0x4d9616C078676C3Fc959A375DE23BD55a597B1D3" },
        { name: "Vesting (Env)", address: import.meta.env.VITE_VESTING_ADDRESS },
        { name: "Token (Test)", address: import.meta.env.VITE_ZRFT_TEST_TOKEN },
        { name: "Factory", address: import.meta.env.VITE_FACTORY_ADDRESS_SEPOLIA },
        { name: "JWK Registry", address: import.meta.env.VITE_JWK_REGISTRY_ADDRESS },
        { name: "Verifier", address: import.meta.env.VITE_VERIFIER_ADDRESS },
    ];

    let isOpen = $state(true);
    let copiedAddress = $state<string | null>(null);

    function copyToClipboard(addr: string) {
        navigator.clipboard.writeText(addr);
        copiedAddress = addr;
        setTimeout(() => copiedAddress = null, 2000);
    }
</script>

<div class="fixed bottom-0 left-0 right-0 z-50 bg-neutral text-neutral-content text-xs font-mono shadow-lg opacity-90 hover:opacity-100 transition-opacity">
    <!-- Toggle Header -->
    <button 
        class="w-full flex justify-between items-center px-4 py-1 bg-neutral-focus hover:bg-neutral-content/10 cursor-pointer border-t border-base-content/10"
        onclick={() => isOpen = !isOpen}
    >
        <span class="font-bold opacity-70">Sepolia Contracts Debug Bar</span>
        <span class="opacity-50">{isOpen ? '▼' : '▲'}</span>
    </button>

    {#if isOpen}
        <div class="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 border-t border-base-content/10">
            {#each contracts as c}
                <div class="flex flex-col overflow-hidden group">
                    <span class="text-[10px] uppercase opacity-50 font-bold tracking-wider">{c.name}</span>
                    <div class="flex items-center gap-2">
                        <a 
                            href={`https://sepolia.etherscan.io/address/${c.address}`} 
                            target="_blank" 
                            class="truncate hover:text-primary transition-colors flex-1"
                            title={c.address}
                        >
                            {c.address?.slice(0, 10)}...{c.address?.slice(-4)}
                        </a>
                        <button 
                            class="btn btn-ghost btn-xs btn-square h-5 w-5 min-h-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onclick={() => copyToClipboard(c.address)}
                            title="Copy Address"
                        >
                            {#if copiedAddress === c.address}
                                <Check class="w-3 h-3 text-success" />
                            {:else}
                                <Copy class="w-3 h-3 opacity-70" />
                            {/if}
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Spacer to prevent content from being hidden behind footer -->
{#if isOpen}
    <div class="h-24"></div>
{:else}
    <div class="h-8"></div>
{/if}
