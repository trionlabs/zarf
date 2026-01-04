<script lang="ts">
    import { onMount } from "svelte";
    import { readVestingContract } from "$lib/contracts/contracts";
    import { Search, AlertCircle, ArrowRight } from "lucide-svelte";
    import type { Address } from "viem";
    import {
        fetchContractMetadata,
        type OnChainVestingContract,
    } from "$lib/services/distributionDiscovery";
    import ZenCard from "$lib/components/ui/ZenCard.svelte";

    let { onImport, vaultAddresses = [] } = $props<{
        onImport: (addr: string) => void;
        vaultAddresses: Address[];
    }>();

    let address = $state("");
    let error = $state<string | null>(null);
    let isLoading = $state(false);

    let vaultContracts = $state<
        (OnChainVestingContract & { launchDate?: string })[]
    >([]);
    let isFetchingVault = $state(false);

    function formatDate(timestamp: bigint) {
        if (timestamp === 0n) return "Not Started";
        return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    onMount(async () => {
        if (!vaultAddresses.length) return;

        isFetchingVault = true;
        try {
            const results = await Promise.all(
                vaultAddresses.map(async (addr: Address) => {
                    const meta = await fetchContractMetadata(addr);
                    if (meta) {
                        return {
                            ...meta,
                            launchDate: formatDate(meta.vestingStart),
                        };
                    }
                    return null;
                }),
            );
            vaultContracts = results.filter(
                (c): c is OnChainVestingContract & { launchDate: string } =>
                    c !== null,
            );
        } catch (e) {
            console.error("Failed to fetch vault metadata", e);
        } finally {
            isFetchingVault = false;
        }
    });

    async function handleSelect(addr: string) {
        address = addr;
        await handleSubmit();
    }

    async function handleSubmit() {
        const addr = address.trim();

        if (/^0x[a-fA-F0-9]{64}$/.test(addr)) {
            error = "This is a Transaction Hash, not a Contract Address.";
            return;
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
            error = "Invalid Ethereum Address";
            return;
        }

        isLoading = true;
        error = null;

        try {
            await readVestingContract(address as Address);
            onImport(address);
        } catch (e) {
            error = "Could not find a valid Zarf Vesting contract";
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="space-y-10">
    <!-- Active Vaults -->
    <div class="space-y-4">
        <div class="flex items-center justify-between px-1">
            <div class="label p-0">
                <span
                    class="label-text font-medium text-base-content/60 text-[10px] uppercase tracking-widest"
                    >Active Distributions</span
                >
            </div>
            {#if isFetchingVault}
                <span class="loading loading-dots loading-xs opacity-20"></span>
            {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#if isFetchingVault && vaultContracts.length === 0}
                {#each Array(4) as _}
                    <div
                        class="h-32 w-full animate-pulse bg-base-100/50 rounded-3xl border border-base-content/5"
                    ></div>
                {/each}
            {:else if vaultContracts.length === 0}
                <div
                    class="col-span-full py-12 text-center bg-base-200/20 rounded-2xl border border-dashed border-base-content/10"
                >
                    <p class="text-xs text-base-content/30 italic">
                        No distribution contracts found in vault
                    </p>
                </div>
            {:else}
                {#each vaultContracts as contract}
                    <ZenCard
                        class="relative group overflow-hidden border-base-content/5 hover:border-primary/20 bg-base-200/30"
                        onclick={() => handleSelect(contract.address)}
                        role="button"
                    >
                        <!-- Dynamic Background Blob -->
                        <div
                            class="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-10 transition-colors duration-500 bg-primary"
                        ></div>

                        <div class="card-body p-6 relative z-10">
                            <div class="flex justify-between items-start mb-1">
                                <h3
                                    class="font-bold text-lg text-base-content group-hover:text-primary transition-colors"
                                >
                                    {contract.name}
                                </h3>
                                <div class="flex items-center gap-2">
                                    <span
                                        class="text-[10px] font-mono opacity-40"
                                        >{contract.tokenSymbol}</span
                                    >
                                    <span
                                        class="px-2 py-0.5 rounded-full bg-base-content/5 text-[9px] text-base-content/40 font-bold uppercase tracking-tighter"
                                    >
                                        {contract.launchDate}
                                    </span>
                                </div>
                            </div>

                            <p
                                class="text-xs text-base-content/50 font-light line-clamp-2 mb-4 leading-relaxed"
                            >
                                {contract.description ||
                                    "No description provided."}
                            </p>

                            <div
                                class="flex items-center justify-between mt-auto pt-4 border-t border-base-content/5"
                            >
                                <code
                                    class="text-[10px] text-base-content/20 font-mono group-hover:text-primary/40 transition-colors"
                                >
                                    {contract.address.slice(
                                        0,
                                        10,
                                    )}...{contract.address.slice(-8)}
                                </code>
                                <div
                                    class="flex items-center gap-1 text-[10px] text-primary opacity-50 group-hover:opacity-100 transition-all font-bold uppercase tracking-widest"
                                >
                                    Enter
                                    <ArrowRight
                                        class="w-3 h-3 group-hover:translate-x-1 transition-transform"
                                    />
                                </div>
                            </div>
                        </div>
                    </ZenCard>
                {/each}
            {/if}
        </div>
    </div>

    <!-- Divider -->
    <div class="divider opacity-5 text-[9px] uppercase tracking-[0.2em]">
        or import manually
    </div>

    <!-- Manual Import -->
    <div class="max-w-xl mx-auto w-full space-y-4 pt-2">
        <label class="sr-only" for="contract-input"
            >Manual Contract Address</label
        >
        <div class="form-control w-full">
            <div class="join w-full shadow-sm">
                <div
                    class="join-item bg-base-200/30 flex items-center px-4 border border-base-content/10 border-r-0"
                >
                    <Search class="w-4 h-4 text-base-content/40" />
                </div>
                <input
                    type="text"
                    id="contract-input"
                    placeholder="Enter manual contract address 0x..."
                    class="input input-bordered join-item w-full font-mono text-sm bg-base-100 border-base-content/10 focus:border-primary/50 text-base-content/80 transition-all h-14"
                    class:input-error={error !== null}
                    bind:value={address}
                    onkeydown={(e) => e.key === "Enter" && handleSubmit()}
                />
                <button
                    type="button"
                    class="btn h-14 join-item border-base-content/10 px-6 font-medium text-xs uppercase tracking-widest"
                    onclick={handleSubmit}
                    disabled={isLoading}
                >
                    {#if isLoading}
                        <span class="loading loading-spinner loading-sm"></span>
                    {:else}
                        Verify
                    {/if}
                </button>
            </div>

            {#if error}
                <div
                    class="flex items-center gap-1.5 text-[10px] text-error font-medium mt-2 px-2"
                >
                    <AlertCircle class="w-3 h-3" />
                    {error}
                </div>
            {/if}
        </div>
    </div>
</div>
