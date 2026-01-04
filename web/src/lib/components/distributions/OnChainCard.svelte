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
        // For now, maybe just select it, or if we had a dashboard page for deployed contracts
        // goto(`/distributions/${contract.address}`);
        onSelect?.(contract);
    }
</script>

<ZenCard
    onclick={() => onSelect?.(contract)}
    onkeydown={(e) => e.key === "Enter" && onSelect?.(contract)}
    role="button"
    tabindex={0}
>
    <div class="card-body p-6 space-y-5">
        <!-- Header -->
        <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success font-bold text-lg"
                >
                    {(contract.name || "U").charAt(0)}
                </div>
                <div>
                    <h3 class="font-semibold text-base">
                        {contract.name || "Unnamed"}
                    </h3>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-xs text-base-content/50 font-mono">
                            {contract.tokenSymbol || "TOKEN"}
                        </span>
                        <span class="badge badge-xs badge-success">
                            Active
                        </span>
                    </div>
                </div>
            </div>

            <!-- Link to Etherscan (Optional on card, maybe better in details) -->
            <!-- <a 
                href={`https://sepolia.etherscan.io/address/${contract.address}`} 
                target="_blank" 
                rel="noreferrer"
                class="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100"
                onclick={(e) => e.stopPropagation()}
            >
                <ExternalLink class="w-3 h-3" />
            </a> -->
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3">
            <div class="space-y-1">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40"
                >
                    <Coins class="w-3 h-3" />
                    Balance
                </div>
                <p
                    class="font-mono text-sm font-medium truncate"
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
            <div class="space-y-1">
                <div
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-base-content/40"
                >
                    <Hourglass class="w-3 h-3" />
                    Cliff
                </div>
                <p class="font-mono text-sm font-medium">
                    {formatDuration(contract.cliffDuration)}
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
                    {formatDuration(contract.vestingDuration)}
                </p>
            </div>
        </div>

        <!-- Progress Bar -->
        <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
                <span class="text-base-content/50">Vested</span>
                <span class="font-mono">{progress}%</span>
            </div>
            <progress
                class="progress progress-success w-full h-2"
                value={progress}
                max="100"
            ></progress>
        </div>

        <!-- Actions -->
        <div
            class="flex items-center gap-2 pt-2 border-t border-base-content/5"
        >
            <button
                type="button"
                class="btn btn-sm btn-ghost flex-1 gap-1.5"
                onclick={handleViewDashboard}
            >
                <BarChart3 class="w-3.5 h-3.5" />
                Details
            </button>
            <a
                href={`https://sepolia.etherscan.io/address/${contract.address}`}
                target="_blank"
                rel="noreferrer"
                class="btn btn-sm btn-ghost gap-1.5 text-base-content/50 hover:text-primary"
                onclick={(e) => e.stopPropagation()}
            >
                <ExternalLink class="w-3.5 h-3.5" />
                Etherscan
            </a>
        </div>
    </div>
</ZenCard>
