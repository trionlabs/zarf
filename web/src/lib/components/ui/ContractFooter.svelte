<script lang="ts">
    import { page } from "$app/stores";
    
    const contracts = [
        { name: "Vesting", address: import.meta.env.VITE_VESTING_ADDRESS },
        { name: "Token (Test)", address: import.meta.env.VITE_ZRFT_TEST_TOKEN },
        { name: "Factory", address: import.meta.env.VITE_FACTORY_ADDRESS_SEPOLIA },
        { name: "JWK Registry", address: import.meta.env.VITE_JWK_REGISTRY_ADDRESS },
        { name: "Verifier", address: import.meta.env.VITE_VERIFIER_ADDRESS },
    ];

    let isOpen = $state(true);
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
        <div class="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 border-t border-base-content/10">
            {#each contracts as c}
                <div class="flex flex-col overflow-hidden">
                    <span class="text-[10px] uppercase opacity-50 font-bold tracking-wider">{c.name}</span>
                    <a 
                        href={`https://sepolia.etherscan.io/address/${c.address}`} 
                        target="_blank" 
                        class="truncate hover:text-primary transition-colors"
                        title={c.address}
                    >
                        {c.address}
                    </a>
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
