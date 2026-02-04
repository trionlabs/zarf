<script lang="ts">
    import { onMount } from "svelte";
    import { fade, slide } from "svelte/transition";
    import { goto } from "$app/navigation";
    import {
        Plus,
        Wallet,
        Loader2,
        Sparkles,
        AlertCircle,
    } from "lucide-svelte";

    // Stores & Services
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import {
        discoverOwnerVestings,
        type OnChainVestingContract,
    } from "$lib/services/distributionDiscovery";

    // Components
    import PageHeader from "@zarf/ui/components/ui/PageHeader.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenBadge from "@zarf/ui/components/ui/ZenBadge.svelte";
    import ZenAlert from "@zarf/ui/components/ui/ZenAlert.svelte";
    import DistributionCard from "$lib/components/wizard/DistributionCard.svelte";
    import OnChainCard from "$lib/components/distributions/OnChainCard.svelte";
    import DistributionEmptyState from "$lib/components/distributions/DistributionEmptyState.svelte";
    import WalletConnectButton from "@zarf/ui/components/wallet/WalletConnectButton.svelte";

    // State
    let activeTab = $state<"drafts" | "active" | "history">("drafts");
    let isFetching = $state(false);
    let onChainContracts = $state<OnChainVestingContract[]>([]);
    let fetchError = $state<string | null>(null);

    // Derived Lists
    const drafts = $derived(
        wizardStore.distributions.filter(
            (d) =>
                d.state === "created" ||
                (d.state === "launched" && !d.depositTxHash),
        ),
    );

    const activeDistributions = $derived(
        onChainContracts.filter((c) => c.tokenBalance > 0n),
    );

    const historyDistributions = $derived(
        onChainContracts.filter((c) => c.tokenBalance === 0n),
    );

    // Fetch Logic
    async function fetchOnChain() {
        if (!walletStore.address) return;

        isFetching = true;
        fetchError = null;

        try {
            const result = await discoverOwnerVestings(walletStore.address, {
                forceRefresh: true,
            });
            onChainContracts = result.contracts;
        } catch (e) {
            console.error("Discovery failed:", e);
            fetchError = "Could not fetch distributions from blockchain.";
        } finally {
            isFetching = false;
        }
    }

    // Reactivity
    $effect(() => {
        if (walletStore.isConnected && activeTab !== "drafts") {
            fetchOnChain();
        }
    });

    onMount(() => {
        if (drafts.length === 0 && walletStore.isConnected) {
            activeTab = "active";
        }
    });

    function handleCreateNew() {
        goto("/wizard/step-0");
    }
</script>

<div
    class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-full flex flex-col gap-8"
>
    <!-- Header with Action -->
    <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-6"
    >
        <PageHeader
            title="My Distributions"
            description="Manage your drafts, active vesting contracts, and history."
        />
        <div class="flex items-center gap-3">
            <ZenButton variant="primary" onclick={handleCreateNew}>
                <Plus class="w-4 h-4 mr-2" />
                New Distribution
            </ZenButton>
        </div>
    </div>

    <!-- Zen Tabs -->
    <div role="tablist" class="flex gap-1 border-b-[0.5px] border-zen-border-subtle w-full max-w-md">
        <button
            role="tab"
            aria-selected={activeTab === "drafts"}
            class="relative px-4 py-3 text-sm font-medium transition-all duration-200 flex items-center gap-2
                {activeTab === 'drafts'
                    ? 'text-zen-fg'
                    : 'text-zen-fg-subtle hover:text-zen-fg'}"
            onclick={() => (activeTab = "drafts")}
        >
            Drafts
            {#if drafts.length > 0}
                <ZenBadge variant="default" size="sm">{drafts.length}</ZenBadge>
            {/if}
            {#if activeTab === "drafts"}
                <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-zen-fg"></span>
            {/if}
        </button>
        <button
            role="tab"
            aria-selected={activeTab === "active"}
            class="relative px-4 py-3 text-sm font-medium transition-all duration-200 flex items-center gap-2
                {activeTab === 'active'
                    ? 'text-zen-fg'
                    : 'text-zen-fg-subtle hover:text-zen-fg'}"
            onclick={() => (activeTab = "active")}
        >
            Active
            <span class="w-2 h-2 rounded-full bg-zen-success animate-pulse"></span>
            {#if activeTab === "active"}
                <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-zen-fg"></span>
            {/if}
        </button>
        <button
            role="tab"
            aria-selected={activeTab === "history"}
            class="relative px-4 py-3 text-sm font-medium transition-all duration-200 flex items-center gap-2
                {activeTab === 'history'
                    ? 'text-zen-fg'
                    : 'text-zen-fg-subtle hover:text-zen-fg'}"
            onclick={() => (activeTab = "history")}
        >
            History
            {#if activeTab === "history"}
                <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-zen-fg"></span>
            {/if}
        </button>
    </div>

    <!-- Snippets -->
    {#snippet createAction()}
        <ZenButton variant="primary" onclick={handleCreateNew}>
            Create First Distribution
        </ZenButton>
    {/snippet}

    {#snippet deployAction()}
        <ZenButton variant="primary" onclick={handleCreateNew}>
            Deploy New
        </ZenButton>
    {/snippet}

    {#snippet connectAction()}
        <WalletConnectButton />
    {/snippet}

    <!-- Content Area -->
    <div class="relative min-h-[400px]">
        <!-- DRAFTS VIEW -->
        {#if activeTab === "drafts"}
            <div in:fade={{ duration: 200 }} class="space-y-6">
                {#if drafts.length === 0}
                    <DistributionEmptyState
                        icon={Sparkles}
                        title="No Drafts Yet"
                        description="Start creating a token distribution plan. It will be saved locally until you deploy."
                        action={createAction}
                    />
                {:else}
                    <div class="flex flex-col gap-6 pb-12">
                        {#each drafts as dist (dist.id)}
                            <div
                                in:slide|global={{ duration: 200 }}
                                class="w-full"
                            >
                                <DistributionCard distribution={dist} />
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- ACTIVE & HISTORY VIEW (Shared Logic) -->
        {:else}
            <div in:fade={{ duration: 200 }} class="space-y-6">
                {#if !walletStore.isConnected}
                    <DistributionEmptyState
                        icon={Wallet}
                        title="Connect Wallet"
                        description="Connect your wallet to view your on-chain distributions on the Sepolia network."
                        action={connectAction}
                    />
                {:else if isFetching && onChainContracts.length === 0}
                    <div
                        class="flex flex-col items-center justify-center h-64 gap-4"
                    >
                        <Loader2 class="w-8 h-8 text-zen-fg animate-spin" />
                        <span class="text-sm text-zen-fg-subtle"
                            >Scanning network for distributions...</span
                        >
                    </div>
                {:else if fetchError}
                    <ZenAlert variant="error">
                        {#snippet title()}Network Error{/snippet}
                        {fetchError}
                        {#snippet actions()}
                            <ZenButton variant="ghost" size="sm" onclick={fetchOnChain}>
                                Retry
                            </ZenButton>
                        {/snippet}
                    </ZenAlert>
                {:else}
                    <!-- List Active or History based on Tab -->
                    {@const list =
                        activeTab === "active"
                            ? activeDistributions
                            : historyDistributions}

                    {#if list.length === 0}
                        <DistributionEmptyState
                            icon={AlertCircle}
                            title={activeTab === "active"
                                ? "No Active Distributions"
                                : "No History Found"}
                            description={activeTab === "active"
                                ? "You don't have any active vesting contracts on this network."
                                : "No completed or cancelled contracts found."}
                            action={deployAction}
                        />
                    {:else}
                        <div class="flex flex-col gap-6 pb-12">
                            {#each list as contract (contract.address)}
                                <div
                                    in:slide|global={{ duration: 200 }}
                                    class="w-full"
                                >
                                    <OnChainCard
                                        {contract}
                                        onSelect={(c) =>
                                            console.log("Select", c)}
                                    />
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
</div>
