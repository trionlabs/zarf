<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        Rocket,
        Trash2,
        Copy,
        BarChart3,
        Users,
        Ban,
        Eye,
        Calendar,
        Clock,
        Coins,
    } from "lucide-svelte";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import type { Distribution } from "$lib/stores/types";
    import ZenCard from "$lib/components/ui/ZenCard.svelte";
    import ZenButton from "$lib/components/ui/ZenButton.svelte";

    let {
        distribution,
        onSelect,
    }: {
        distribution: Distribution;
        onSelect?: (dist: Distribution) => void;
    } = $props();

    // Derive state with fallback for legacy data
    let currentState = $derived(distribution.state || "created");

    // Determine visual variant
    let variant = $derived(
        currentState === "launched"
            ? "deployed"
            : currentState === "cancelled"
              ? "cancelled"
              : "draft",
    );

    // Border color based on variant
    let borderClass = $derived(
        variant === "deployed"
            ? "border-l-4 border-l-success"
            : variant === "cancelled"
              ? "border-l-4 border-l-error opacity-70"
              : "border-l-4 border-l-warning",
    );

    // Badge styling
    let badgeClass = $derived(
        variant === "deployed"
            ? "badge-success"
            : variant === "cancelled"
              ? "badge-error"
              : "badge-warning",
    );

    let badgeText = $derived(
        variant === "deployed"
            ? "Active"
            : variant === "cancelled"
              ? "Cancelled"
              : "Draft",
    );

    // Format date
    function formatDate(dateString: string | undefined): string {
        if (!dateString) return "Not set";
        return new Date(dateString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    // Actions
    function handleDeploy(e: Event) {
        e.stopPropagation();
        // Navigate to deploy wizard
        goto(`/wizard/deploy?id=${distribution.id}`);
    }

    function handleDelete(e: Event) {
        e.stopPropagation();
        if (confirm(`Delete "${distribution.name}"? This cannot be undone.`)) {
            wizardStore.removeDistribution(distribution.id);
        }
    }

    function handleDuplicate(e: Event) {
        e.stopPropagation();
        // Create a copy with new ID
        const copy: Distribution = {
            ...distribution,
            id: crypto.randomUUID(),
            name: `${distribution.name} (Copy)`,
            state: "created",
            createdAt: new Date().toISOString(),
            launchedAt: undefined,
            cancelledAt: undefined,
            depositTxHash: undefined,
        };
        wizardStore.addDistribution(copy);
    }

    function handleViewDashboard(e: Event) {
        e.stopPropagation();
        // TODO: Navigate to dashboard
        console.log("Dashboard:", distribution.id);
    }

    function handleCancel(e: Event) {
        e.stopPropagation();
        if (
            confirm(
                `Cancel "${distribution.name}"? Remaining tokens will be returned.`,
            )
        ) {
            wizardStore.cancelDistribution(distribution.id);
        }
    }
</script>

<ZenCard
    onclick={() => onSelect?.(distribution)}
    onkeydown={(e) => e.key === "Enter" && onSelect?.(distribution)}
    role="button"
    tabindex={0}
>
    <div class="card-body p-6 space-y-5">
        <!-- Header -->
        <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg"
                >
                    {distribution.name.charAt(0)}
                </div>
                <div>
                    <h3 class="font-semibold text-base">{distribution.name}</h3>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-xs text-base-content/50 font-mono">
                            {wizardStore.tokenDetails.tokenSymbol || "TOKEN"}
                        </span>
                        <span class="badge badge-xs {badgeClass}">
                            {badgeText}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3">
            <div class="space-y-1">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40"
                >
                    <Coins class="w-3 h-3" />
                    Amount
                </div>
                <p class="font-mono text-sm font-medium">
                    {Number(distribution.amount).toLocaleString()}
                </p>
            </div>
            <div class="space-y-1">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40"
                >
                    <Users class="w-3 h-3" />
                    Recipients
                </div>
                <p class="font-mono text-sm font-medium">
                    {distribution.recipients.length}
                </p>
            </div>
            <div class="space-y-1">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40"
                >
                    <Clock class="w-3 h-3" />
                    Duration
                </div>
                <p class="font-mono text-sm font-medium">
                    {distribution.schedule.distributionDuration}
                    {distribution.schedule.durationUnit}
                </p>
            </div>
        </div>

        <!-- Progress Bar (only for deployed) -->
        {#if variant === "deployed"}
            <div class="space-y-2">
                <div class="flex items-center justify-between text-xs">
                    <span class="text-base-content/50">Claimed</span>
                    <span class="font-mono">0%</span>
                </div>
                <progress
                    class="progress progress-success w-full h-2"
                    value="0"
                    max="100"
                ></progress>
            </div>
        {/if}

        <!-- Schedule Info (for drafts) -->
        {#if variant === "draft"}
            <div
                class="flex items-center gap-4 text-xs text-base-content/50 pt-2 border-t border-base-content/5"
            >
                <div class="flex items-center gap-1.5">
                    <Calendar class="w-3.5 h-3.5" />
                    Cliff: {formatDate(distribution.schedule.cliffEndDate)}
                </div>
            </div>
        {/if}

        <!-- Cancelled Stats -->
        {#if variant === "cancelled"}
            <div
                class="flex items-center gap-4 text-xs text-base-content/50 pt-2 border-t border-base-content/5"
            >
                <div class="flex items-center gap-1.5">
                    <Ban class="w-3.5 h-3.5" />
                    Cancelled: {formatDate(distribution.cancelledAt)}
                </div>
            </div>
        {/if}

        <!-- Actions -->
        <div
            class="flex items-center gap-2 pt-2 border-t border-base-content/5"
        >
            {#if variant === "draft"}
                <!-- Use button type="button" to prevent form submission if inside a form, though not the case here -->
                <ZenButton size="sm" class="flex-1" onclick={handleDeploy}>
                    <Rocket class="w-3.5 h-3.5" />
                    Deploy
                </ZenButton>
                <button
                    type="button"
                    class="btn btn-sm btn-ghost btn-square text-error/60 hover:text-error"
                    onclick={handleDelete}
                    title="Delete"
                >
                    <Trash2 class="w-4 h-4" />
                </button>
            {:else if variant === "deployed"}
                <button
                    type="button"
                    class="btn btn-sm btn-ghost flex-1 gap-1.5"
                    onclick={handleViewDashboard}
                >
                    <BarChart3 class="w-3.5 h-3.5" />
                    Dashboard
                </button>
                <button
                    type="button"
                    class="btn btn-sm btn-ghost gap-1.5"
                    onclick={() => onSelect?.(distribution)}
                >
                    <Users class="w-3.5 h-3.5" />
                    Recipients
                </button>
                <button
                    type="button"
                    class="btn btn-sm btn-ghost btn-square text-error/60 hover:text-error"
                    onclick={handleCancel}
                    title="Cancel Distribution"
                >
                    <Ban class="w-4 h-4" />
                </button>
            {:else if variant === "cancelled"}
                <button
                    type="button"
                    class="btn btn-sm btn-ghost flex-1 gap-1.5"
                    onclick={() => onSelect?.(distribution)}
                >
                    <Eye class="w-3.5 h-3.5" />
                    View History
                </button>
                <button
                    type="button"
                    class="btn btn-sm btn-ghost btn-square"
                    onclick={handleDuplicate}
                    title="Duplicate as Draft"
                >
                    <Copy class="w-4 h-4" />
                </button>
                <button
                    type="button"
                    class="btn btn-sm btn-ghost btn-square text-error/60 hover:text-error"
                    onclick={handleDelete}
                    title="Remove"
                >
                    <Trash2 class="w-4 h-4" />
                </button>
            {/if}
        </div>
    </div></ZenCard
>
