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
    } from "lucide-svelte";
    import type { Distribution } from "$lib/stores/types";
    import DistributionCard from "$lib/components/wizard/DistributionCard.svelte";
    import DistributionDetailPanel from "$lib/components/wizard/DistributionDetailPanel.svelte";

    // SSR Guard - prevents hydration mismatch
    let mounted = $state(false);

    onMount(() => {
        wizardStore.restore();
        mounted = true;
    });

    // Tab state
    type TabType = "deployed" | "drafts" | "cancelled";
    let activeTab = $state<TabType>("drafts");

    // Selected distribution for detail panel
    let selectedDistribution = $state<Distribution | null>(null);
    let drawerOpen = $state(false);

    // Filtered distributions
    const deployedDistributions = $derived(
        wizardStore.distributions.filter((d) => d.state === "launched"),
    );

    const draftDistributions = $derived(
        wizardStore.distributions.filter(
            (d) => d.state === "created" || !d.state,
        ),
    );

    const cancelledDistributions = $derived(
        wizardStore.distributions.filter((d) => d.state === "cancelled"),
    );

    const currentDistributions = $derived(
        activeTab === "deployed"
            ? deployedDistributions
            : activeTab === "cancelled"
              ? cancelledDistributions
              : draftDistributions,
    );

    // Tab configs
    const tabs = [
        {
            id: "deployed" as TabType,
            label: "Deployed",
            icon: Rocket,
            color: "text-success",
            bgColor: "bg-success/10",
        },
        {
            id: "drafts" as TabType,
            label: "Not Deployed",
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
        drawerOpen = true;
    }

    function closeDrawer() {
        drawerOpen = false;
        selectedDistribution = null;
    }

    function getTabCount(tabId: TabType): number {
        switch (tabId) {
            case "deployed":
                return deployedDistributions.length;
            case "drafts":
                return draftDistributions.length;
            case "cancelled":
                return cancelledDistributions.length;
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
                            <div class="stat-title text-xs">
                                Total Distributions
                            </div>
                            <div class="stat-value text-2xl">
                                {wizardStore.distributions.length}
                            </div>
                        </div>
                        <div
                            class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                        >
                            <div class="stat-title text-xs">Active</div>
                            <div class="stat-value text-2xl text-success">
                                {deployedDistributions.length}
                            </div>
                        </div>
                        <div
                            class="stat bg-base-100 rounded-xl border border-base-content/5 p-4"
                        >
                            <div class="stat-title text-xs">Pending Deploy</div>
                            <div class="stat-value text-2xl text-warning">
                                {draftDistributions.length}
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
                    </div>
                </header>

                <!-- Content -->
                <div in:fade={{ duration: 150 }}>
                    {#if currentDistributions.length === 0}
                        <!-- Empty States -->
                        <div
                            class="flex flex-col items-center justify-center py-16 text-center"
                        >
                            {#if activeTab === "deployed"}
                                <div
                                    class="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4"
                                >
                                    <Rocket class="w-8 h-8 text-success/50" />
                                </div>
                                <h3 class="font-medium text-lg mb-2">
                                    No active distributions
                                </h3>
                                <p
                                    class="text-sm text-base-content/50 max-w-sm mb-6"
                                >
                                    Deploy your first distribution to start
                                    vesting tokens to your recipients.
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
                            {:else if activeTab === "drafts"}
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
                            {:else}
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
                            {/if}
                        </div>
                    {:else}
                        <!-- Card Grid -->
                        <div class="grid md:grid-cols-2 xl:grid-cols-2 gap-4">
                            {#each currentDistributions as distribution (distribution.id)}
                                <div in:fade={{ duration: 150 }}>
                                    <DistributionCard
                                        {distribution}
                                        onSelect={selectDistribution}
                                    />
                                </div>
                            {/each}
                        </div>
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
