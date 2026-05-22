<script lang="ts">
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";
    import { Rocket, Trash2, Copy, Ban, Calendar } from "lucide-svelte";
    import { wizardStore } from "../../stores/wizardStore.svelte";
    import type { Distribution } from "../../stores/types";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenBadge from "@zarf/ui/components/ui/ZenBadge.svelte";

    let {
        distribution,
        onSelect,
    }: {
        distribution: Distribution;
        onSelect?: (dist: Distribution) => void;
    } = $props();

    const currentState = $derived(distribution.state || "created");

    const variant = $derived(
        currentState === "launched"
            ? "deployed"
            : currentState === "cancelled"
              ? "cancelled"
              : "draft",
    );

    const variantStyles = {
        deployed: {
            badgeVariant: "success" as const,
            badge: "Active",
        },
        cancelled: {
            badgeVariant: "error" as const,
            badge: "Cancelled",
        },
        draft: {
            badgeVariant: "warning" as const,
            badge: "Draft",
        },
    } as const;

    const style = $derived(
        variantStyles[variant as keyof typeof variantStyles],
    );

    function formatDate(dateString: string | undefined): string {
        if (!dateString) return "Not set";
        return new Date(dateString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

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
</script>

<div
    class="group flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-6 w-full transition-all duration-300"
>
    <!-- Main Card Content -->
    <ZenCard
        variant="glass"
        interactive
        radius="3xl"
        onclick={() => onSelect?.(distribution)}
        onkeydown={(e) => e.key === "Enter" && onSelect?.(distribution)}
        role="button"
        tabindex={0}
        class="flex-1 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
    >
        <div
            class="p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6 md:gap-8 relative"
        >
            <!-- Mobile Top Right Actions -->
            {#if variant === "draft"}
                <div class="absolute top-4 right-4 flex gap-1 md:hidden">
                    <ZenButton
                        variant="ghost"
                        size="xs"
                        class="w-8 h-8 !p-0"
                        onclick={handleDuplicate}
                        title="Duplicate"
                    >
                        <Copy class="w-4 h-4" />
                    </ZenButton>
                    <ZenButton
                        variant="danger"
                        size="xs"
                        class="w-8 h-8 !p-0"
                        onclick={handleDelete}
                        title="Delete"
                    >
                        <Trash2 class="w-4 h-4" />
                    </ZenButton>
                </div>
            {/if}
            <!-- Identity -->
            <div
                class="flex items-center gap-4 md:gap-5 w-full md:w-auto md:min-w-[200px]"
            >
                <div
                    class="w-12 h-12 md:w-16 md:h-16 rounded-full bg-zen-highlight-bg text-zen-highlight-fg flex items-center justify-center text-lg md:text-2xl font-black tracking-tighter shrink-0"
                >
                    {distribution.name.charAt(0).toUpperCase()}
                </div>
                <div class="space-y-1 min-w-0 flex-1">
                    <h3
                        class="font-extrabold text-xl md:text-2xl text-zen-fg leading-none truncate"
                    >
                        {distribution.name}
                    </h3>
                    <div class="flex flex-wrap items-center gap-2">
                        <ZenBadge variant={style.badgeVariant} size="sm">
                            {style.badge}
                        </ZenBadge>
                        <span
                            class="text-[10px] font-bold text-zen-fg-faint tracking-widest uppercase truncate"
                        >
                            {wizardStore.tokenDetails.tokenSymbol || "TOKEN"}
                        </span>
                    </div>
                    {#if variant === "draft"}
                        <div
                            class="flex items-center gap-1.5 text-[10px] text-zen-fg-faint font-medium pt-0.5"
                        >
                            <Calendar class="w-3 h-3 shrink-0" />
                            <span class="truncate"
                                >Cliff: {formatDate(
                                    distribution.schedule.cliffEndDate,
                                )}</span
                            >
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Stats -->
            <div
                class="grid grid-cols-3 gap-4 w-full md:flex md:w-auto md:gap-12 md:ml-auto"
            >
                <!-- Amount -->
                <div>
                    <div
                        class="text-[9px] font-bold uppercase tracking-widest text-zen-fg-faint mb-1"
                    >
                        Amount
                    </div>
                    <div
                        class="text-xl md:text-2xl font-black text-zen-fg tracking-tight leading-none"
                    >
                        {Number(distribution.amount).toLocaleString()}
                    </div>
                </div>

                <!-- Recipients -->
                <div>
                    <div
                        class="text-[9px] font-bold uppercase tracking-widest text-zen-fg-faint mb-1"
                    >
                        Recipients
                    </div>
                    <div
                        class="text-xl md:text-2xl font-black text-zen-fg tracking-tight leading-none"
                    >
                        {distribution.recipients.length}
                    </div>
                </div>

                <!-- Duration -->
                <div class="col-span-1">
                    <div
                        class="text-[9px] font-bold uppercase tracking-widest text-zen-fg-faint mb-1"
                    >
                        Duration
                    </div>
                    <div
                        class="text-xl md:text-2xl font-black text-zen-fg tracking-tight leading-none"
                    >
                        {distribution.schedule.distributionDuration}
                        <span class="text-xs font-bold text-zen-fg-faint ml-0.5"
                            >{distribution.schedule.durationUnit}</span
                        >
                    </div>
                </div>
                <!-- Actions (Inside Card) -->
                <div
                    class="flex items-center gap-3 w-full md:w-auto md:ml-6 border-t-[0.5px] md:border-t-0 md:border-l-[0.5px] border-zen-border-subtle pt-4 md:pt-0 md:pl-6 mt-2 md:mt-0"
                >
                    {#if variant === "draft"}
                        <ZenButton
                            variant="primary"
                            size="md"
                            class="flex-1 md:min-w-[120px]"
                            onclick={handleDeploy}
                            title="Deploy"
                        >
                            {#snippet iconLeft()}
                                {#if browser}
                                    <Rocket class="w-5 h-5" />
                                {/if}
                            {/snippet}
                            Deploy
                        </ZenButton>
                        <div class="hidden md:contents">
                            <ZenButton
                                variant="ghost"
                                size="sm"
                                class="w-10 h-10 !p-0 shrink-0"
                                onclick={handleDuplicate}
                                title="Duplicate"
                            >
                                <Copy class="w-5 h-5" />
                            </ZenButton>
                            <ZenButton
                                variant="danger"
                                size="sm"
                                class="w-10 h-10 !p-0 shrink-0"
                                onclick={handleDelete}
                                title="Delete"
                            >
                                <Trash2 class="w-5 h-5" />
                            </ZenButton>
                        </div>
                    {:else}
                        <ZenButton
                            variant="primary"
                            size="md"
                            class="w-full md:w-auto px-6"
                            onclick={() => onSelect?.(distribution)}
                        >
                            View
                        </ZenButton>
                    {/if}
                </div>
            </div>
        </div></ZenCard
    >
</div>
