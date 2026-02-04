<script lang="ts">
    import { readVestingContract } from "@zarf/core/contracts";
    import { Search, AlertCircle, ArrowRight, Loader2, Inbox } from "lucide-svelte";
    import type { Address } from "viem";
    import {
        fetchContractMetadata,
        type OnChainVestingContract,
    } from "../../services/distributionDiscovery";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import AddressInput from "@zarf/ui/components/ui/AddressInput.svelte";

    let { onImport, vaultAddresses = [], isFiltering = false } = $props<{
        onImport: (addr: string) => void;
        vaultAddresses: Address[];
        isFiltering?: boolean;
    }>();

    let address = $state("");
    let error = $state<string | null>(null);
    let isLoading = $state(false);

    let vaultContracts = $state<
        (OnChainVestingContract & { launchDate?: string })[]
    >([]);
    let isFetchingVault = $state(false);

    // Version counter to prevent stale updates from race conditions
    // Using plain variable (not $state) since we only write in effect, read in callbacks
    let fetchVersion = 0;

    function formatDate(timestamp: bigint) {
        if (timestamp === 0n) return "Not Started";
        return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    // Fetch metadata when vaultAddresses changes (reactive to filtering)
    $effect(() => {
        if (!vaultAddresses.length) {
            vaultContracts = [];
            isFetchingVault = false;
            return;
        }

        // Increment version to track this fetch batch
        const currentVersion = ++fetchVersion;
        const addressesToFetch = [...vaultAddresses];

        isFetchingVault = true;

        Promise.all(
            addressesToFetch.map(async (addr: Address) => {
                const meta = await fetchContractMetadata(addr);
                if (meta) {
                    return {
                        ...meta,
                        launchDate: formatDate(meta.vestingStart),
                    };
                }
                return null;
            }),
        )
            .then((results) => {
                // Only update if this is still the latest fetch
                if (currentVersion !== fetchVersion) return;

                vaultContracts = results.filter(
                    (c): c is OnChainVestingContract & { launchDate: string } =>
                        c !== null,
                );
            })
            .catch((e) => {
                if (currentVersion !== fetchVersion) return;
                console.error("Failed to fetch vault metadata", e);
            })
            .finally(() => {
                if (currentVersion !== fetchVersion) return;
                isFetchingVault = false;
            });
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
            <div class="p-0">
                <span
                    class="font-medium text-zen-fg-muted text-xs uppercase tracking-widest"
                    >{isFiltering ? "Finding Your Distributions" : "Your Distributions"}</span
                >
            </div>
            {#if isFetchingVault || isFiltering}
                <Loader2 class="w-4 h-4 animate-spin text-zen-fg-muted" />
            {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#if (isFetchingVault || isFiltering) && vaultContracts.length === 0}
                {#each Array(4) as _}
                    <div
                        class="h-32 w-full animate-pulse bg-zen-bg/50 rounded-3xl border border-zen-border-subtle"
                    ></div>
                {/each}
            {:else if vaultContracts.length === 0}
                <div
                    class="col-span-full py-12 text-center bg-zen-fg/5 rounded-2xl border border-dashed border-zen-border space-y-3"
                >
                    <Inbox class="w-8 h-8 mx-auto text-zen-fg-faint opacity-50" />
                    <div class="space-y-1">
                        <p class="text-sm text-zen-fg-muted font-medium">
                            No distributions found for your email
                        </p>
                        <p class="text-xs text-zen-fg-faint">
                            If you have a contract address, you can import it manually below
                        </p>
                    </div>
                </div>
            {:else}
                {#each vaultContracts as contract}
                    <ZenCard
                        interactive
                        variant="elevated"
                        class="relative group overflow-hidden"
                        onclick={() => handleSelect(contract.address)}
                    >
                        <!-- Dynamic Background Blob -->
                        <div
                            class="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-10 transition-colors duration-500 bg-zen-primary"
                        ></div>

                        <div class="p-6 relative z-10">
                            <div class="flex justify-between items-start mb-1">
                                <h3
                                    class="font-bold text-lg text-zen-fg group-hover:text-zen-primary transition-colors"
                                >
                                    {contract.name}
                                </h3>
                                <div class="flex items-center gap-2">
                                    <span
                                        class="text-xs font-mono opacity-40"
                                        >{contract.tokenSymbol}</span
                                    >
                                    <span
                                        class="px-2 py-0.5 rounded-full bg-zen-fg/5 text-xs text-zen-fg-subtle font-bold uppercase tracking-tighter"
                                    >
                                        {contract.launchDate}
                                    </span>
                                </div>
                            </div>

                            <p
                                class="text-xs text-zen-fg-muted font-light line-clamp-2 mb-4 leading-relaxed"
                            >
                                {contract.description ||
                                    "No description provided."}
                            </p>

                            <div
                                class="flex items-center justify-between mt-auto pt-4 border-t border-zen-border-subtle"
                            >
                                <code
                                    class="text-xs text-zen-fg-faint font-mono group-hover:text-zen-primary/40 transition-colors"
                                >
                                    {contract.address.slice(
                                        0,
                                        10,
                                    )}...{contract.address.slice(-8)}
                                </code>
                                <div
                                    class="flex items-center gap-1 text-xs text-zen-primary opacity-50 group-hover:opacity-100 transition-all font-bold uppercase tracking-widest"
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
    <div class="flex items-center gap-4 opacity-20 text-xs uppercase tracking-widest">
        <div class="flex-1 h-px bg-zen-border"></div>
        <span>or import manually</span>
        <div class="flex-1 h-px bg-zen-border"></div>
    </div>

    <!-- Manual Import -->
    <div class="max-w-xl mx-auto w-full pt-2">
        <label class="sr-only" for="contract-input"
            >Manual Contract Address</label
        >
        <AddressInput
            bind:value={address}
            placeholder="Enter manual contract address 0x..."
            {error}
            {isLoading}
            onAction={handleSubmit}
            onInput={() => error = null}
            actionLabel="Verify"
        />
    </div>
</div>
