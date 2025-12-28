<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import {
        X,
        Calendar,
        Clock,
        Users,
        Coins,
        Trash2,
        Rocket,
        FileText,
        ChevronRight,
    } from "lucide-svelte";
    import type { Distribution } from "$lib/stores/types";

    let {
        distribution,
        onClose,
    }: {
        distribution: Distribution;
        onClose: () => void;
    } = $props();

    // Fallback for legacy data
    let currentState = $derived(distribution.state || "created");

    function handleDelete() {
        if (confirm(`Delete "${distribution.name}"? This cannot be undone.`)) {
            wizardStore.removeDistribution(distribution.id);
            onClose();
        }
    }

    function handleDeploy() {
        // For now, navigate to success page
        // In future, this will trigger wallet connection flow
        wizardStore.nextStep();
        goto("/wizard/step-3");
    }

    // Format date for display
    function formatDate(dateString: string): string {
        if (!dateString) return "Not set";
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }
</script>

<div class="h-full flex flex-col bg-base-100">
    <!-- Header -->
    <header
        class="p-4 border-b border-base-content/5 flex items-center justify-between"
    >
        <div class="flex items-center gap-3">
            <div
                class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold"
            >
                {distribution.name.charAt(0)}
            </div>
            <div>
                <h2 class="font-semibold text-base">{distribution.name}</h2>
                <span
                    class="badge badge-sm {currentState === 'created'
                        ? 'badge-warning'
                        : currentState === 'launched'
                          ? 'badge-success'
                          : 'badge-error'}"
                >
                    {currentState === "created"
                        ? "Draft"
                        : currentState === "launched"
                          ? "Active"
                          : "Cancelled"}
                </span>
            </div>
        </div>
        <button
            class="btn btn-ghost btn-sm btn-circle xl:hidden"
            onclick={onClose}
        >
            <X class="w-4 h-4" />
        </button>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- Description -->
        {#if distribution.description}
            <div class="space-y-1">
                <h3
                    class="text-[10px] uppercase tracking-wider font-bold text-base-content/40"
                >
                    Description
                </h3>
                <p class="text-sm text-base-content/70">
                    {distribution.description}
                </p>
            </div>
        {/if}

        <!-- Amount -->
        <div
            class="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-1"
        >
            <div class="flex items-center gap-2 text-primary/60">
                <Coins class="w-4 h-4" />
                <span class="text-[10px] uppercase tracking-wider font-bold"
                    >Distribution Amount</span
                >
            </div>
            <p class="text-2xl font-mono font-bold text-primary">
                {Number(distribution.amount).toLocaleString()}
                <span class="text-sm font-normal opacity-60"
                    >{wizardStore.tokenDetails.tokenSymbol}</span
                >
            </p>
        </div>

        <!-- Schedule -->
        <div class="space-y-3">
            <h3
                class="text-[10px] uppercase tracking-wider font-bold text-base-content/40 flex items-center gap-2"
            >
                <Calendar class="w-3.5 h-3.5" />
                Schedule
            </h3>
            <div class="grid grid-cols-2 gap-3">
                <div class="p-3 rounded-lg bg-base-200/50 space-y-1">
                    <span class="text-[10px] text-base-content/40"
                        >Cliff Date</span
                    >
                    <p class="text-sm font-medium">
                        {formatDate(distribution.schedule.cliffEndDate)}
                    </p>
                </div>
                <div class="p-3 rounded-lg bg-base-200/50 space-y-1">
                    <span class="text-[10px] text-base-content/40"
                        >Duration</span
                    >
                    <p class="text-sm font-medium">
                        {distribution.schedule.distributionDuration}
                        {distribution.schedule.durationUnit}
                    </p>
                </div>
            </div>
        </div>

        <!-- Recipients -->
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <h3
                    class="text-[10px] uppercase tracking-wider font-bold text-base-content/40 flex items-center gap-2"
                >
                    <Users class="w-3.5 h-3.5" />
                    Recipients
                </h3>
                <span class="text-xs text-base-content/50"
                    >{distribution.recipients.length} total</span
                >
            </div>

            <div class="space-y-2">
                {#each distribution.recipients.slice(0, 5) as recipient, i}
                    <div
                        class="flex items-center justify-between p-2 rounded-lg bg-base-200/30 text-sm"
                    >
                        <span class="font-mono text-xs truncate max-w-[120px]">
                            {recipient.email ||
                                recipient.address?.slice(0, 10) + "..."}
                        </span>
                        <span class="font-mono text-xs text-base-content/60">
                            {recipient.amount.toLocaleString()}
                        </span>
                    </div>
                {/each}

                {#if distribution.recipients.length > 5}
                    <button
                        class="w-full p-2 rounded-lg border border-base-content/10 text-xs text-base-content/50 hover:text-base-content hover:bg-base-200/50 transition-colors flex items-center justify-center gap-1"
                    >
                        View all {distribution.recipients.length} recipients
                        <ChevronRight class="w-3 h-3" />
                    </button>
                {/if}
            </div>
        </div>

        <!-- Regulatory Rules -->
        {#if distribution.regulatoryRules && distribution.regulatoryRules.length > 0}
            <div class="space-y-2">
                <h3
                    class="text-[10px] uppercase tracking-wider font-bold text-base-content/40 flex items-center gap-2"
                >
                    <FileText class="w-3.5 h-3.5" />
                    Compliance
                </h3>
                <div class="flex flex-wrap gap-2">
                    {#each distribution.regulatoryRules as rule}
                        <span class="badge badge-sm badge-outline">{rule}</span>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <!-- Footer Actions -->
    {#if currentState === "created"}
        <footer class="p-4 border-t border-base-content/5 space-y-2">
            <button class="btn btn-primary w-full gap-2" onclick={handleDeploy}>
                <Rocket class="w-4 h-4" />
                Deploy Distribution
            </button>
            <button
                class="btn btn-ghost btn-sm w-full text-error/60 hover:text-error hover:bg-error/10"
                onclick={handleDelete}
            >
                <Trash2 class="w-4 h-4" />
                Delete
            </button>
        </footer>
    {/if}
</div>
