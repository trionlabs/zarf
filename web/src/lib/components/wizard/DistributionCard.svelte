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
        AlertCircle,
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

    // Variant Styles Map to ensure Tailwind picks up classes
    const variantStyles = {
        deployed: {
            color: "success",
            borderRequest: "hover:border-success/30",
            bgRequest: "bg-success",
            bgOpacity: "bg-success/10",
            text: "text-success",
            badge: "Active",
        },
        cancelled: {
            color: "error",
            borderRequest: "hover:border-error/30",
            bgRequest: "bg-error",
            bgOpacity: "bg-error/10",
            text: "text-error",
            badge: "Cancelled",
        },
        draft: {
            color: "warning",
            borderRequest: "hover:border-warning/30",
            bgRequest: "bg-warning",
            bgOpacity: "bg-warning/10",
            text: "text-warning",
            badge: "Draft",
        },
    } as const;

    // Use a type cast or typed derived to ensure key matches
    let style = $derived(variantStyles[variant as keyof typeof variantStyles]);

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
    class="relative group overflow-hidden border-base-content/5 {style.borderRequest}"
>
    <!-- Dynamic Background Blob -->
    <div
        class="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-5 group-hover:opacity-10 transition-colors duration-500 {style.bgRequest}"
    ></div>

    <div class="card-body p-6 space-y-6 relative z-10">
        <!-- Header -->
        <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
                <div
                    class="w-12 h-12 rounded-2xl {style.bgOpacity} flex items-center justify-center {style.text} text-xl font-bold shadow-sm group-hover:scale-105 transition-transform duration-300"
                >
                    {distribution.name.charAt(0)}
                </div>
                <div>
                    <h3
                        class="font-bold text-lg text-base-content group-hover:{style.text} transition-colors"
                    >
                        {distribution.name}
                    </h3>
                    <div class="flex items-center gap-2 mt-1">
                        <span
                            class="text-xs font-mono text-base-content/40 tracking-wide"
                        >
                            {wizardStore.tokenDetails.tokenSymbol || "TOKEN"}
                        </span>
                        <div
                            class="flex items-center gap-1 px-1.5 py-0.5 rounded-md {style.bgOpacity} {style.text} text-[10px] font-bold uppercase tracking-wider"
                        >
                            <div
                                class="w-1 h-1 rounded-full {style.bgRequest} {variant ===
                                'draft'
                                    ? ''
                                    : 'animate-pulse'}"
                            ></div>
                            {style.badge}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Action for Drafts -->
            {#if variant === "draft"}
                <!-- Use normal class since variant is draft known -->
                <button
                    class="btn btn-sm btn-warning btn-outline gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100"
                    onclick={handleDeploy}
                >
                    Deploy <Rocket class="w-3 h-3" />
                </button>
            {/if}
        </div>

        <!-- Stats Grid -->
        <div
            class="grid grid-cols-3 gap-4 p-4 rounded-2xl bg-base-200/30 border border-base-content/5"
        >
            <div class="space-y-1">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40 font-semibold"
                >
                    <Coins class="w-3 h-3" />
                    Amount
                </div>
                <p class="font-mono text-sm font-semibold truncate">
                    {Number(distribution.amount).toLocaleString()}
                </p>
            </div>
            <div class="space-y-1 border-l border-base-content/5 pl-4">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40 font-semibold"
                >
                    <Users class="w-3 h-3" />
                    Recipient
                </div>
                <p class="font-mono text-sm font-semibold">
                    {distribution.recipients.length}
                </p>
            </div>
            <div class="space-y-1 border-l border-base-content/5 pl-4">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40 font-semibold"
                >
                    <Clock class="w-3 h-3" />
                    Duration
                </div>
                <p class="font-mono text-sm font-semibold">
                    {distribution.schedule.distributionDuration}
                    {distribution.schedule.durationUnit}
                </p>
            </div>
        </div>

        <!-- Extra Info / Progress -->
        <div class="space-y-2 min-h-[0.5rem]">
            {#if variant === "deployed"}
                <!-- Progress Bar -->
                <div class="flex items-center justify-between text-xs">
                    <span class="text-base-content/40 font-medium">Claimed</span
                    >
                    <span class="font-mono font-bold text-success">0%</span>
                </div>
                <div
                    class="w-full h-1.5 bg-base-content/5 rounded-full overflow-hidden"
                >
                    <div class="h-full bg-success w-0"></div>
                </div>
            {:else if variant === "draft"}
                <div
                    class="flex items-center gap-2 text-xs text-base-content/40 pt-1"
                >
                    <Calendar class="w-3.5 h-3.5" />
                    <span
                        >Cliff ends {formatDate(
                            distribution.schedule.cliffEndDate,
                        )}</span
                    >
                </div>
            {:else if variant === "cancelled"}
                <div class="flex items-center gap-2 text-xs text-error/60 pt-1">
                    <Ban class="w-3.5 h-3.5" />
                    <span
                        >Cancelled on {formatDate(
                            distribution.cancelledAt,
                        )}</span
                    >
                </div>
            {/if}
        </div>

        <!-- Actions Footer -->
        <div
            class="pt-2 flex items-center justify-between gap-2 border-t border-base-content/5"
        >
            <div class="flex items-center gap-2">
                {#if variant === "draft"}
                    <button
                        type="button"
                        class="btn btn-sm btn-ghost btn-square text-error/40 hover:text-error hover:bg-error/10 transition-colors"
                        onclick={handleDelete}
                        title="Delete Draft"
                    >
                        <Trash2 class="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-ghost btn-square text-base-content/40 hover:text-primary transition-colors"
                        onclick={handleDuplicate}
                        title="Duplicate"
                    >
                        <Copy class="w-4 h-4" />
                    </button>
                {:else}
                    <button
                        type="button"
                        class="btn btn-sm btn-ghost gap-1.5 text-base-content/60 hover:text-base-content"
                        onclick={() => onSelect?.(distribution)}
                    >
                        View Details
                    </button>
                {/if}
            </div>

            <!-- Primary Action Placeholders -->
            {#if variant === "deployed"}
                <button
                    type="button"
                    class="btn btn-sm btn-ghost gap-1.5 text-error/60 hover:text-error hover:bg-error/5"
                    onclick={handleCancel}
                >
                    <Ban class="w-3.5 h-3.5" />
                    Cancel
                </button>
            {/if}
        </div>
    </div></ZenCard
>
