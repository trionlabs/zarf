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
        Wallet,
    } from "lucide-svelte";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import type { Distribution } from "$lib/stores/types";
    import DistributionCard from "$lib/components/wizard/DistributionCard.svelte";
    import DistributionDetailPanel from "$lib/components/wizard/DistributionDetailPanel.svelte";
    import OnChainCard from "$lib/components/distributions/OnChainCard.svelte";
    import OnChainDetailPanel from "$lib/components/distributions/OnChainDetailPanel.svelte";
    import DistributionEmptyState from "$lib/components/distributions/DistributionEmptyState.svelte";
    import PageHeader from "$lib/components/ui/PageHeader.svelte";
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

    // Derived Logic for Refresh Button (Clean Markup)
    let refreshIconClass = $derived(onChainLoading ? "animate-spin" : "");

    // Derived date formatting
    let refreshLabel = $derived.by(() => {
        if (!lastFetchedAt) return "Refresh";
        const seconds = Math.floor((Date.now() - lastFetchedAt) / 1000);
        if (seconds < 60) return "just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    });

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

    // Derived counts for UI (Clean Markup)
    const vaultCount = $derived(onChainContracts.length);
    const draftsCount = $derived(draftDistributions.length);
    const cancelledCount = $derived(cancelledDistributions.length);
    // Use derived total for clean templates
    const totalCount = $derived(vaultCount + draftsCount);
    // Explicit derived boolean for snippet logic
    const hasDrafts = $derived(draftDistributions.length > 0);

    // Tab visibility logic
    const isVaultTab = $derived(activeTab === "vault");
    const isDraftsTab = $derived(activeTab === "drafts");
    const isCancelledTab = $derived(activeTab === "cancelled");

    // Empty state logic
    const showVaultEmpty = $derived(
        isVaultTab && !onChainLoading && !onChainError && vaultCount === 0,
    );
    const showDraftsEmpty = $derived(isDraftsTab && draftsCount === 0);
    const showCancelledEmpty = $derived(isCancelledTab && cancelledCount === 0);

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
            <div class="max-w-6xl">
                <!-- Header Component -->
                <div class="flex items-center justify-between">
                    <PageHeader
                        title="Distributions"
                        description="Manage all your token distributions in one place"
                    />

                    <button
                        class="btn btn-primary gap-2"
                        onclick={() => goto("/wizard/step-0")}
                    >
                        <Plus class="w-4 h-4" />
                        New Distribution
                    </button>
                </div>

                <!-- Quick Stats -->
                <div class="grid grid-cols-3 gap-4 mb-10">
                    <div
                        class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                    >
                        <div class="stat-title text-xs flex items-center gap-1">
                            <Cloud class="w-3 h-3" />
                            On-Chain (Vault)
                        </div>
                        <div class="stat-value text-2xl text-success">
                            {vaultCount}
                        </div>
                    </div>
                    <div
                        class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                    >
                        <div class="stat-title text-xs">Drafts</div>
                        <div class="stat-value text-2xl text-warning">
                            {draftsCount}
                        </div>
                    </div>
                    <div
                        class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                    >
                        <div class="stat-title text-xs">Total</div>
                        <div class="stat-value text-2xl">
                            {totalCount}
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <div
                    class="flex gap-2 border-b border-base-content/10 pb-px mb-6"
                >
                    {#each tabs as tab}
                        {@const isActive = activeTab === tab.id}
                        {@const count = getTabCount(tab.id)}
                        {@const Icon = tab.icon}

                        <!-- Dynamic class logic via conditional rendering or derived is preferred over complex template literals, 
                             but here keeping it simple as it's readable and local to the loop -->
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
                    {#if isVaultTab}
                        <button
                            class="ml-auto flex items-center gap-2 px-3 py-2 text-xs text-base-content/50 hover:text-base-content transition-colors"
                            onclick={() => fetchOnChainContracts(true)}
                            disabled={onChainLoading}
                        >
                            <RefreshCw class="w-3 h-3 {refreshIconClass}" />
                            {refreshLabel}
                        </button>
                    {/if}
                </div>

                <!-- Content -->
                <div in:fade={{ duration: 150 }}>
                    <!-- VAULT TAB: On-Chain Contracts -->
                    {#if isVaultTab}
                        {#if !walletStore.isConnected}
                            <!-- Wallet Not Connected State -->
                            <DistributionEmptyState
                                icon={Wallet}
                                title="Connect Wallet"
                                description="Connect your wallet to view your active distributions fetched directly from the blockchain."
                                color="bg-primary/10"
                                iconColor="text-primary"
                            >
                                {#snippet action()}
                                    <button
                                        class="btn btn-primary gap-2"
                                        onclick={() =>
                                            walletStore.requestConnection()}
                                    >
                                        <Wallet class="w-4 h-4" />
                                        Connect Wallet
                                    </button>
                                {/snippet}
                            </DistributionEmptyState>
                        {:else if onChainLoading}
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
                            <!-- Error State via EmptyState Component -->
                            <DistributionEmptyState
                                icon={AlertCircle}
                                title="Failed to load contracts"
                                description={onChainError}
                                color="bg-error/10"
                                iconColor="text-error/50"
                            >
                                {#snippet action()}
                                    <button
                                        class="btn btn-primary gap-2"
                                        onclick={() =>
                                            fetchOnChainContracts(true)}
                                    >
                                        <RefreshCw class="w-4 h-4" />
                                        Try Again
                                    </button>
                                {/snippet}
                            </DistributionEmptyState>
                        {:else if showVaultEmpty}
                            <!-- Empty State via Component -->
                            <DistributionEmptyState
                                icon={Cloud}
                                title="No on-chain distributions"
                                description="Deploy your first distribution to see it here. Your active contracts are fetched directly from the blockchain."
                                color="bg-success/10"
                                iconColor="text-success/50"
                            >
                                {#snippet action()}
                                    {#if hasDrafts}
                                        <button
                                            class="btn btn-primary gap-2"
                                            onclick={() =>
                                                (activeTab = "drafts")}
                                        >
                                            View Drafts
                                            <ArrowRight class="w-4 h-4" />
                                        </button>
                                    {:else}
                                        <button
                                            class="btn btn-primary gap-2"
                                            onclick={() =>
                                                goto("/wizard/step-0")}
                                        >
                                            <Plus class="w-4 h-4" />
                                            Create Distribution
                                        </button>
                                    {/if}
                                {/snippet}
                            </DistributionEmptyState>
                        {:else}
                            <!-- On-Chain Contract Cards -->
                            <div
                                class="grid md:grid-cols-2 xl:grid-cols-2 gap-4"
                            >
                                {#each onChainContracts as contract (contract.address)}
                                    <div in:fade={{ duration: 150 }}>
                                        <OnChainCard
                                            {contract}
                                            onSelect={selectOnChainContract}
                                        />
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <!-- DRAFTS TAB -->
                    {:else if isDraftsTab}
                        {#if showDraftsEmpty}
                            <DistributionEmptyState
                                icon={FileText}
                                title="No drafts yet"
                                description="Create a new distribution to get started with token vesting."
                                color="bg-warning/10"
                                iconColor="text-warning/50"
                            >
                                {#snippet action()}
                                    <button
                                        class="btn btn-primary gap-2"
                                        onclick={() => goto("/wizard/step-0")}
                                    >
                                        <Plus class="w-4 h-4" />
                                        Create Distribution
                                    </button>
                                {/snippet}
                            </DistributionEmptyState>
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
                    {:else if isCancelledTab}
                        {#if showCancelledEmpty}
                            <DistributionEmptyState
                                icon={Ban}
                                title="No cancelled distributions"
                                description="That's a good thing! All your distributions are running smoothly."
                                color="bg-base-content/5"
                                iconColor="text-base-content/20"
                            />
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
                    <OnChainDetailPanel
                        contract={selectedOnChain}
                        onClose={closeDrawer}
                    />
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
