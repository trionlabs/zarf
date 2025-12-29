<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import {
        Plus,
        Rocket,
        FileText,
        Ban,
        Search,
        ArrowRight,
        Cloud,
        RefreshCw,
        AlertCircle,
    } from "lucide-svelte";
    import type { Distribution } from "$lib/stores/types";
    import DistributionCard from "$lib/components/wizard/DistributionCard.svelte";
    import DistributionDetailPanel from "$lib/components/wizard/DistributionDetailPanel.svelte";
    import { getWalletAccount } from "$lib/contracts/wallet";
    import {
        discoverOwnerVestings,
        type OnChainVestingContract,
        type DiscoveryResult,
    } from "$lib/services/distributionDiscovery";

    // SSR Guard - prevents hydration mismatch
    let mounted = $state(false);

    // On-chain discovery state
    let onChainLoading = $state(false);
    let onChainError = $state<string | null>(null);
    let onChainContracts = $state<OnChainVestingContract[]>([]);
    let onChainTotal = $state(0);
    let lastFetchedAt = $state<number | null>(null);

    onMount(() => {
        wizardStore.restore();
        mounted = true;

        // Fetch on-chain contracts if wallet is connected
        fetchOnChainContracts();
    });

    async function fetchOnChainContracts(forceRefresh = false) {
        const account = getWalletAccount();
        if (!account.isConnected || !account.address) {
            onChainContracts = [];
            onChainTotal = 0;
            return;
        }

        onChainLoading = true;
        onChainError = null;

        try {
            const result = await discoverOwnerVestings(account.address, {
                forceRefresh,
            });
            onChainContracts = result.contracts;
            onChainTotal = result.total;
            lastFetchedAt = result.fetchedAt;
        } catch (err: any) {
            console.error("[Distributions] Discovery failed:", err);
            onChainError = err.message || "Failed to fetch on-chain contracts";
            onChainContracts = [];
        } finally {
            onChainLoading = false;
        }
    }

    // Tab state
    type TabType = "vault" | "drafts" | "cancelled";
    let activeTab = $state<TabType>("drafts");

    // Selected distribution for detail panel
    let selectedDistribution = $state<Distribution | null>(null);
    let selectedOnChain = $state<OnChainVestingContract | null>(null);
    let drawerOpen = $state(false);

    // Filtered local distributions (from localStorage)
    const draftDistributions = $derived(
        wizardStore.distributions.filter(
            (d) => d.state === "created" || !d.state,
        ),
    );

    const cancelledDistributions = $derived(
        wizardStore.distributions.filter((d) => d.state === "cancelled"),
    );

    // Tab configs - Now with Vault (on-chain) as primary
    const tabs = [
        {
            id: "vault" as TabType,
            label: "Active Vault",
            icon: Cloud,
            color: "text-success",
            bgColor: "bg-success/10",
        },
        {
            id: "drafts" as TabType,
            label: "Drafts",
            icon: FileText,
            color: "text-warning",
            bgColor: "bg-warning/10",
        },
        {
            id: "cancelled" as TabType,
            label: "Cancelled",
            icon: Ban,
            color: "text-error",
            bgColor: "bg-error/10",
        },
    ];

    function selectDistribution(dist: Distribution) {
        selectedDistribution = dist;
        selectedOnChain = null;
        drawerOpen = true;
    }

    function selectOnChainContract(contract: OnChainVestingContract) {
        selectedOnChain = contract;
        selectedDistribution = null;
        drawerOpen = true;
    }

    function closeDrawer() {
        drawerOpen = false;
        selectedDistribution = null;
        selectedOnChain = null;
    }

    // Derived values for clean markup (FE_DEV.md: Derived-First Rule)
    const vaultCount = $derived(onChainContracts.length);
    const draftsCount = $derived(draftDistributions.length);
    const cancelledCount = $derived(cancelledDistributions.length);
    const totalCount = $derived(vaultCount + draftsCount);
    const refreshIconClass = $derived(onChainLoading ? "animate-spin" : "");
    const refreshLabel = $derived(
        lastFetchedAt ? formatTimeAgo(lastFetchedAt) : "Refresh",
    );
    const isVaultTab = $derived(activeTab === "vault");
    const isDraftsTab = $derived(activeTab === "drafts");
    const isCancelledTab = $derived(activeTab === "cancelled");
    const hasOnChainContracts = $derived(onChainContracts.length > 0);
    const hasDrafts = $derived(draftDistributions.length > 0);

    function getTabCount(tabId: TabType): number {
        switch (tabId) {
            case "vault":
                return vaultCount;
            case "drafts":
                return draftsCount;
            case "cancelled":
                return cancelledCount;
        }
    }

    function formatTokenBalance(balance: bigint, decimals: number): string {
        const divisor = BigInt(10 ** decimals);
        const integerPart = balance / divisor;
        return integerPart.toLocaleString();
    }

    function formatTimeAgo(timestamp: number): string {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return "just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    }
</script>

{#if mounted}
    <div class="drawer drawer-end xl:drawer-open min-h-screen">
        <input
            id="distributions-drawer"
            type="checkbox"
            class="drawer-toggle"
            bind:checked={drawerOpen}
        />

        <!-- Main Content -->
        <div class="drawer-content">
            <div class="max-w-6xl mx-auto px-6 py-8">
                <!-- Header -->
                <header class="mb-8">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h1 class="text-2xl font-bold tracking-tight">
                                Distributions
                            </h1>
                            <p class="text-sm text-base-content/50 mt-1">
                                Manage all your token distributions in one place
                            </p>
                        </div>
                        <button
                            class="btn btn-primary gap-2"
                            onclick={() => goto("/wizard/step-0")}
                        >
                            <Plus class="w-4 h-4" />
                            New Distribution
                        </button>
                    </div>

                    <!-- Quick Stats -->
                    <div class="grid grid-cols-3 gap-4 mb-8">
                        <div
                            class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                        >
                            <div
                                class="stat-title text-xs flex items-center gap-1"
                            >
                                <Cloud class="w-3 h-3" />
                                On-Chain (Vault)
                            </div>
                            <div class="stat-value text-2xl text-success">
                                {onChainContracts.length}
                            </div>
                        </div>
                        <div
                            class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                        >
                            <div class="stat-title text-xs">Drafts</div>
                            <div class="stat-value text-2xl text-warning">
                                {draftDistributions.length}
                            </div>
                        </div>
                        <div
                            class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                        >
                            <div class="stat-title text-xs">Total</div>
                            <div class="stat-value text-2xl">
                                {onChainContracts.length +
                                    draftDistributions.length}
                            </div>
                        </div>
                    </div>

                    <!-- Tabs -->
                    <div
                        class="flex gap-2 border-b border-base-content/10 pb-px"
                    >
                        {#each tabs as tab}
                            {@const isActive = activeTab === tab.id}
                            {@const count = getTabCount(tab.id)}
                            {@const Icon = tab.icon}
                            <button
                                class="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px
                            {isActive
                                    ? `${tab.color} border-current`
                                    : 'text-base-content/50 border-transparent hover:text-base-content'}"
                                onclick={() => (activeTab = tab.id)}
                            >
                                <Icon class="w-4 h-4" />
                                {tab.label}
                                <span
                                    class="badge badge-sm {isActive
                                        ? tab.bgColor + ' ' + tab.color
                                        : 'bg-base-content/10'}"
                                >
                                    {count}
                                </span>
                            </button>
                        {/each}

                        <!-- Refresh button for Vault tab -->
                        {#if activeTab === "vault"}
                            <button
                                class="ml-auto flex items-center gap-2 px-3 py-2 text-xs text-base-content/50 hover:text-base-content transition-colors"
                                onclick={() => fetchOnChainContracts(true)}
                                disabled={onChainLoading}
                            >
                                <RefreshCw
                                    class="w-3 h-3 {onChainLoading
                                        ? 'animate-spin'
                                        : ''}"
                                />
                                {lastFetchedAt
                                    ? formatTimeAgo(lastFetchedAt)
                                    : "Refresh"}
                            </button>
                        {/if}
                    </div>
                </header>

                <!-- Content -->
                <div in:fade={{ duration: 150 }}>
                    <!-- VAULT TAB: On-Chain Contracts -->
                    {#if activeTab === "vault"}
                        {#if onChainLoading}
                            <!-- Loading State -->
                            <div
                                class="grid md:grid-cols-2 xl:grid-cols-2 gap-4"
                            >
                                {#each Array(3) as _}
                                    <div
                                        class="card bg-base-100 border border-base-content/5 animate-pulse"
                                    >
                                        <div class="card-body">
                                            <div
                                                class="h-5 bg-base-content/5 rounded w-3/4 mb-3"
                                            ></div>
                                            <div
                                                class="h-4 bg-base-content/5 rounded w-1/2 mb-2"
                                            ></div>
                                            <div
                                                class="h-4 bg-base-content/5 rounded w-1/3"
                                            ></div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {:else if onChainError}
                            <!-- Error State -->
                            <div
                                class="flex flex-col items-center justify-center py-16 text-center"
                            >
                                <div
                                    class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mb-4"
                                >
                                    <AlertCircle
                                        class="w-8 h-8 text-error/50"
                                    />
                                </div>
                                <h3 class="font-medium text-lg mb-2">
                                    Failed to load contracts
                                </h3>
                                <p
                                    class="text-sm text-base-content/50 max-w-sm mb-6"
                                >
                                    {onChainError}
                                </p>
                                <button
                                    class="btn btn-primary gap-2"
                                    onclick={() => fetchOnChainContracts(true)}
                                >
                                    <RefreshCw class="w-4 h-4" />
                                    Try Again
                                </button>
                            </div>
                        {:else if onChainContracts.length === 0}
                            <!-- Empty State -->
                            <div
                                class="flex flex-col items-center justify-center py-16 text-center"
                            >
                                <div
                                    class="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4"
                                >
                                    <Cloud class="w-8 h-8 text-success/50" />
                                </div>
                                <h3 class="font-medium text-lg mb-2">
                                    No on-chain distributions
                                </h3>
                                <p
                                    class="text-sm text-base-content/50 max-w-sm mb-6"
                                >
                                    Deploy your first distribution to see it
                                    here. Your active contracts are fetched
                                    directly from the blockchain.
                                </p>
                                {#if draftDistributions.length > 0}
                                    <button
                                        class="btn btn-primary gap-2"
                                        onclick={() => (activeTab = "drafts")}
                                    >
                                        View Drafts
                                        <ArrowRight class="w-4 h-4" />
                                    </button>
                                {:else}
                                    <button
                                        class="btn btn-primary gap-2"
                                        onclick={() => goto("/wizard/step-0")}
                                    >
                                        <Plus class="w-4 h-4" />
                                        Create Distribution
                                    </button>
                                {/if}
                            </div>
                        {:else}
                            <!-- On-Chain Contract Cards -->
                            <div
                                class="grid md:grid-cols-2 xl:grid-cols-2 gap-4"
                            >
                                {#each onChainContracts as contract (contract.address)}
                                    <div in:fade={{ duration: 150 }}>
                                        <button
                                            class="card bg-base-100 border border-base-content/5 hover:border-success/30 hover:shadow-lg transition-all w-full text-left cursor-pointer"
                                            onclick={() =>
                                                selectOnChainContract(contract)}
                                        >
                                            <div class="card-body p-5">
                                                <div
                                                    class="flex items-start justify-between"
                                                >
                                                    <div>
                                                        <div
                                                            class="flex items-center gap-2 mb-1"
                                                        >
                                                            <span
                                                                class="badge badge-success badge-xs"
                                                                >On-Chain</span
                                                            >
                                                        </div>
                                                        <h3
                                                            class="font-semibold text-lg"
                                                        >
                                                            {contract.name ||
                                                                "Unnamed"}
                                                        </h3>
                                                        <p
                                                            class="text-sm text-base-content/50 line-clamp-1"
                                                        >
                                                            {contract.description ||
                                                                "No description"}
                                                        </p>
                                                    </div>
                                                    <div class="text-right">
                                                        <div
                                                            class="text-lg font-bold"
                                                        >
                                                            {formatTokenBalance(
                                                                contract.tokenBalance,
                                                                contract.tokenDecimals,
                                                            )}
                                                        </div>
                                                        <div
                                                            class="text-xs text-base-content/50"
                                                        >
                                                            {contract.tokenSymbol}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="divider my-2"></div>
                                                <div
                                                    class="flex items-center justify-between text-xs text-base-content/50"
                                                >
                                                    <span class="font-mono"
                                                        >{contract.address.slice(
                                                            0,
                                                            8,
                                                        )}...{contract.address.slice(
                                                            -6,
                                                        )}</span
                                                    >
                                                    <Rocket
                                                        class="w-4 h-4 text-success"
                                                    />
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <!-- DRAFTS TAB -->
                    {:else if activeTab === "drafts"}
                        {#if draftDistributions.length === 0}
                            <div
                                class="flex flex-col items-center justify-center py-16 text-center"
                            >
                                <div
                                    class="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4"
                                >
                                    <FileText class="w-8 h-8 text-warning/50" />
                                </div>
                                <h3 class="font-medium text-lg mb-2">
                                    No drafts yet
                                </h3>
                                <p
                                    class="text-sm text-base-content/50 max-w-sm mb-6"
                                >
                                    Create a new distribution to get started
                                    with token vesting.
                                </p>
                                <button
                                    class="btn btn-primary gap-2"
                                    onclick={() => goto("/wizard/step-0")}
                                >
                                    <Plus class="w-4 h-4" />
                                    Create Distribution
                                </button>
                            </div>
                        {:else}
                            <div
                                class="grid md:grid-cols-2 xl:grid-cols-2 gap-4"
                            >
                                {#each draftDistributions as distribution (distribution.id)}
                                    <div in:fade={{ duration: 150 }}>
                                        <DistributionCard
                                            {distribution}
                                            onSelect={selectDistribution}
                                        />
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <!-- CANCELLED TAB -->
                    {:else if activeTab === "cancelled"}
                        {#if cancelledDistributions.length === 0}
                            <div
                                class="flex flex-col items-center justify-center py-16 text-center"
                            >
                                <div
                                    class="w-16 h-16 rounded-full bg-base-content/5 flex items-center justify-center mb-4"
                                >
                                    <Ban class="w-8 h-8 text-base-content/20" />
                                </div>
                                <h3 class="font-medium text-lg mb-2">
                                    No cancelled distributions
                                </h3>
                                <p
                                    class="text-sm text-base-content/50 max-w-sm"
                                >
                                    That's a good thing! All your distributions
                                    are running smoothly.
                                </p>
                            </div>
                        {:else}
                            <div
                                class="grid md:grid-cols-2 xl:grid-cols-2 gap-4"
                            >
                                {#each cancelledDistributions as distribution (distribution.id)}
                                    <div in:fade={{ duration: 150 }}>
                                        <DistributionCard
                                            {distribution}
                                            onSelect={selectDistribution}
                                        />
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    {/if}
                </div>
            </div>
        </div>

        <!-- Drawer Side (Detail Panel) -->
        <div class="drawer-side z-40">
            <label
                for="distributions-drawer"
                aria-label="close sidebar"
                class="drawer-overlay"
            ></label>
            <div
                class="w-80 min-h-full bg-base-100 border-l border-base-content/5"
            >
                {#if selectedDistribution}
                    <DistributionDetailPanel
                        distribution={selectedDistribution}
                        onClose={closeDrawer}
                    />
                {:else if selectedOnChain}
                    <!-- On-Chain Contract Detail -->
                    <div class="p-5">
                        <div class="flex items-center justify-between mb-6">
                            <span class="badge badge-success">On-Chain</span>
                            <button
                                class="btn btn-ghost btn-sm"
                                onclick={closeDrawer}>✕</button
                            >
                        </div>
                        <h2 class="text-xl font-bold mb-2">
                            {selectedOnChain.name || "Unnamed"}
                        </h2>
                        <p class="text-sm text-base-content/50 mb-6">
                            {selectedOnChain.description || "No description"}
                        </p>

                        <div class="space-y-4">
                            <div class="bg-base-200/50 rounded-lg p-4">
                                <div class="text-xs text-base-content/50 mb-1">
                                    Contract Address
                                </div>
                                <div class="font-mono text-sm break-all">
                                    {selectedOnChain.address}
                                </div>
                            </div>

                            <div class="bg-base-200/50 rounded-lg p-4">
                                <div class="text-xs text-base-content/50 mb-1">
                                    Token Balance
                                </div>
                                <div class="text-2xl font-bold">
                                    {formatTokenBalance(
                                        selectedOnChain.tokenBalance,
                                        selectedOnChain.tokenDecimals,
                                    )}
                                    <span
                                        class="text-sm font-normal text-base-content/50"
                                        >{selectedOnChain.tokenSymbol}</span
                                    >
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div class="bg-base-200/50 rounded-lg p-3">
                                    <div class="text-xs text-base-content/50">
                                        Cliff
                                    </div>
                                    <div class="font-medium">
                                        {Number(selectedOnChain.cliffDuration) /
                                            86400}d
                                    </div>
                                </div>
                                <div class="bg-base-200/50 rounded-lg p-3">
                                    <div class="text-xs text-base-content/50">
                                        Duration
                                    </div>
                                    <div class="font-medium">
                                        {Number(
                                            selectedOnChain.vestingDuration,
                                        ) / 86400}d
                                    </div>
                                </div>
                            </div>

                            <a
                                href="https://sepolia.etherscan.io/address/{selectedOnChain.address}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn btn-outline btn-block mt-4"
                            >
                                View on Etherscan
                            </a>
                        </div>
                    </div>
                {:else}
                    <div
                        class="h-full flex items-center justify-center text-base-content/30 p-8 text-center"
                    >
                        <div>
                            <Search class="w-8 h-8 mx-auto mb-3 opacity-30" />
                            <p class="text-sm">
                                Select a distribution to view details
                            </p>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{:else}
    <!-- Loading placeholder while hydrating -->
    <div class="min-h-screen flex items-center justify-center">
        <span class="loading loading-spinner loading-lg"></span>
    </div>
{/if}
