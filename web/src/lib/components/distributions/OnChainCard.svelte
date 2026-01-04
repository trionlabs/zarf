<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        BarChart3,
        Calendar,
        Clock,
        Coins,
        Rocket,
        ExternalLink,
        Hourglass,
        CheckCircle2,
    } from "lucide-svelte";
    import type { OnChainVestingContract } from "$lib/services/distributionDiscovery";
    import ZenCard from "$lib/components/ui/ZenCard.svelte";

    let {
        contract,
        onSelect,
    }: {
        contract: OnChainVestingContract;
        onSelect?: (contract: OnChainVestingContract) => void;
    } = $props();

    // Format helpers
    function formatTokenBalance(balance: bigint, decimals: number): string {
        const divisor = BigInt(10 ** decimals);
        // show 2 decimals
        const integerPart = balance / divisor;
        const remainder = balance % divisor;
        const decimalPart = remainder
            .toString()
            .padStart(decimals, "0")
            .slice(0, 2);

        return `${integerPart.toLocaleString()}.${decimalPart}`;
    }

    function formatDuration(seconds: bigint): string {
        const d = Number(seconds) / 86400;
        return `${d.toFixed(1)} days`;
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

<ZenCard
    onclick={() => onSelect?.(contract)}
    onkeydown={(e) => e.key === "Enter" && onSelect?.(contract)}
    role="button"
    tabindex={0}
    class="relative group overflow-hidden border-base-content/5 hover:border-success/30"
>
    <!-- Background Gradient Blob -->
    <div
        class="absolute -top-10 -right-10 w-32 h-32 bg-success/5 rounded-full blur-3xl group-hover:bg-success/10 transition-colors duration-500"
    ></div>

    <div class="card-body p-6 space-y-6 relative z-10">
        <!-- Header -->
        <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
                <div
                    class="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center text-success text-xl font-bold shadow-sm group-hover:scale-105 transition-transform duration-300"
                >
                    {(contract.name || "U").charAt(0)}
                </div>
                <div>
                    <h3
                        class="font-bold text-lg text-base-content group-hover:text-success transition-colors"
                    >
                        {contract.name || "Unnamed"}
                    </h3>
                    <div class="flex items-center gap-2 mt-1">
                        <span
                            class="text-xs font-mono text-base-content/40 tracking-wide"
                        >
                            {contract.tokenSymbol || "TOKEN"}
                        </span>
                        <div
                            class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-success/10 text-success text-[10px] font-bold uppercase tracking-wider"
                        >
                            <div
                                class="w-1 h-1 rounded-full bg-success animate-pulse"
                            ></div>
                            Active
                        </div>
                    </div>
                </div>
            </div>
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
                    Balance
                </div>
                <p
                    class="font-mono text-sm font-semibold truncate"
                    title={formatTokenBalance(
                        contract.tokenBalance,
                        contract.tokenDecimals,
                    )}
                >
                    {formatTokenBalance(
                        contract.tokenBalance,
                        contract.tokenDecimals,
                    )}
                </p>
            </div>
            <div class="space-y-1 border-l border-base-content/5 pl-4">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40 font-semibold"
                >
                    <Hourglass class="w-3 h-3" />
                    Cliff
                </div>
                <p class="font-mono text-sm font-semibold">
                    {formatDuration(contract.cliffDuration)}
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
                    {formatDuration(contract.vestingDuration)}
                </p>
            </div>
        </div>

        <!-- Progress Section -->
        <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
                <span class="text-base-content/40 font-medium"
                    >Vesting Progress</span
                >
                <span class="font-mono font-bold text-success">{progress}%</span
                >
            </div>
            <div
                class="w-full h-1.5 bg-base-content/5 rounded-full overflow-hidden"
            >
                <div
                    class="h-full bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.5)] transition-all duration-1000 ease-out"
                    style="width: {progress}%"
                ></div>
            </div>
        </div>

        <!-- Actions -->
        <div
            class="pt-2 flex items-center justify-end gap-2 border-t border-base-content/5"
        >
            <a
                href={`https://sepolia.etherscan.io/address/${contract.address}`}
                target="_blank"
                rel="noreferrer"
                class="btn btn-xs btn-ghost gap-1.5 text-base-content/40 hover:text-base-content hover:bg-base-content/5 transition-all"
                onclick={(e) => e.stopPropagation()}
            >
                <ExternalLink class="w-3 h-3" />
                <span class="hidden sm:inline">Scanner</span>
            </a>
            <button
                type="button"
                class="btn btn-sm btn-ghost gap-1.5 text-base-content/70 hover:text-primary hover:bg-primary/5 transition-all group/btn"
                onclick={handleViewDashboard}
            >
                Dashboard
                <BarChart3
                    class="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform"
                />
            </button>
        </div>
    </div>
</ZenCard>
