<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        BarChart3,
        ExternalLink,
        Hourglass,
        CheckCircle2,
    } from "lucide-svelte";
    import type { OnChainVestingContract } from "../../services/distributionDiscovery";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenBadge from "@zarf/ui/components/ui/ZenBadge.svelte";

    let {
        contract,
        onSelect,
    }: {
        contract: OnChainVestingContract;
        onSelect?: (contract: OnChainVestingContract) => void;
    } = $props();

    // Derived State
    const isActive = $derived(contract.tokenBalance > 0n);
    const variant = $derived(isActive ? "active" : "history");

    const styles = {
        active: {
            badgeVariant: "success" as const,
            badge: "Active",
        },
        history: {
            badgeVariant: "default" as const,
            badge: "Completed",
        },
    } as const;

    const style = $derived(styles[variant as keyof typeof styles]);

    // Format helpers
    function formatTokenBalance(balance: bigint, decimals: number): string {
        const divisor = BigInt(10 ** decimals);
        const integerPart = balance / divisor;
        return BigInt(integerPart).toLocaleString();
    }

    function calculateProgress(start: bigint, duration: bigint): number {
        if (start === 0n) return 0;
        const now = BigInt(Math.floor(Date.now() / 1000));
        const elapsed = now - start;
        if (elapsed < 0n) return 0;
        if (elapsed >= duration) return 100;
        return Number((elapsed * 100n) / duration);
    }

    let progress = $derived(
        calculateProgress(contract.vestingStart, contract.vestingDuration),
    );

    function handleViewDashboard(e: Event) {
        e.stopPropagation();
        onSelect?.(contract);
    }
</script>

<div
    class="group flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-6 w-full transition-all duration-300"
>
    <ZenCard
        variant="glass"
        interactive
        radius="3xl"
        onclick={() => onSelect?.(contract)}
        onkeydown={(e) => e.key === "Enter" && onSelect?.(contract)}
        role="button"
        tabindex={0}
        class="flex-1 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
    >
        <div
            class="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-0"
        >
            <!-- LEFT: Identity (Fixed Width or Flex-1 if needed, but keeping it distinct) -->
            <div class="flex items-center gap-4 md:gap-6 min-w-0 pr-6">
                <div
                    class="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center text-lg md:text-2xl font-black tracking-tighter shrink-0 transition-colors
                    {isActive ? 'bg-zen-highlight-bg text-zen-highlight-fg' : 'bg-zen-fg/5 text-zen-fg-subtle'}"
                >
                    {(contract.name || "U").charAt(0).toUpperCase()}
                </div>
                <div class="space-y-1 min-w-0">
                    <h3
                        class="font-extrabold text-xl md:text-2xl text-zen-fg leading-none truncate"
                    >
                        {contract.name || "Unnamed"}
                    </h3>
                    <div class="flex flex-wrap items-center gap-2">
                        <ZenBadge variant={style.badgeVariant} size="sm">
                            {style.badge}
                        </ZenBadge>
                        <span
                            class="text-[10px] font-bold text-zen-fg-faint tracking-widest uppercase truncate"
                        >
                            {contract.tokenSymbol || "TOKEN"}
                        </span>
                    </div>
                </div>
            </div>

            <!-- RIGHT: The Monolith Block (Stats + Divider + Actions) -->
            <!-- We use md:flex to make it horizontal on desktop, fully integrated -->
            <div
                class="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8 md:pl-8 md:border-l-[0.5px] border-zen-border-subtle w-full md:w-auto mt-2 md:mt-0"
            >
                <!-- Stats Group (Compact) -->
                <div
                    class="flex items-center gap-8 md:gap-12 w-full md:w-auto justify-between md:justify-start"
                >
                    <!-- Balance -->
                    <div>
                        <div
                            class="text-[9px] font-bold uppercase tracking-widest text-zen-fg-faint mb-1"
                        >
                            Remaining
                        </div>
                        <div
                            class="text-xl md:text-2xl font-black text-zen-fg tracking-tight leading-none"
                        >
                            {formatTokenBalance(
                                contract.tokenBalance,
                                contract.tokenDecimals,
                            )}
                        </div>
                    </div>

                    <!-- Progress -->
                    <div>
                        <div
                            class="text-[9px] font-bold uppercase tracking-widest text-zen-fg-faint mb-1"
                        >
                            Vested
                        </div>
                        <div
                            class="text-xl md:text-2xl font-black tracking-tight leading-none
                            {isActive ? 'text-zen-highlight-fg' : 'text-zen-fg-subtle'}"
                        >
                            {progress}%
                        </div>
                    </div>
                </div>

                <!-- Actions Group -->
                <div
                    class="flex items-center gap-3 w-full md:w-auto pt-4 md:pt-0 border-t-[0.5px] md:border-t-0 border-zen-border-subtle mt-auto"
                >
                    <a
                        href={`https://sepolia.etherscan.io/address/${contract.address}`}
                        target="_blank"
                        rel="noreferrer"
                        class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-transparent text-zen-fg-subtle hover:text-zen-fg transition-colors flex items-center justify-center"
                        onclick={(e) => e.stopPropagation()}
                        title="View on Etherscan"
                    >
                        <ExternalLink class="w-4 h-4 md:w-5 md:h-5" />
                    </a>

                    <ZenButton
                        variant="primary"
                        size="md"
                        class="w-full md:w-auto px-8 min-w-[120px]"
                        onclick={handleViewDashboard}
                    >
                        View
                    </ZenButton>
                </div>
            </div>
        </div>
    </ZenCard>
</div>
