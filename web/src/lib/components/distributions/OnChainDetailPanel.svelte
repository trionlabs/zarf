<script lang="ts">
    import {
        X,
        Calendar,
        Clock,
        Coins,
        ExternalLink,
        Hourglass,
        ShieldCheck,
    } from "lucide-svelte";
    import type { OnChainVestingContract } from "$lib/services/distributionDiscovery";

    let {
        contract,
        onClose,
    }: {
        contract: OnChainVestingContract;
        onClose: () => void;
    } = $props();

    // Format helpers
    function formatTokenBalance(balance: bigint, decimals: number): string {
        const divisor = BigInt(10 ** decimals);
        const integerPart = balance / divisor;
        const remainder = balance % divisor;
        // show up to 4 decimals for details
        const decimalPart = remainder
            .toString()
            .padStart(decimals, "0")
            .slice(0, 4);
        return `${integerPart.toLocaleString()}.${decimalPart}`;
    }

    function formatDuration(seconds: bigint): string {
        const d = Number(seconds) / 86400;
        return `${d.toFixed(2)} days`;
    }

    function formatDate(timestamp: bigint): string {
        if (timestamp === 0n) return "Not set";
        return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
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
                class="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success font-bold"
            >
                {(contract.name || "U").charAt(0)}
            </div>
            <div>
                <h2 class="font-semibold text-base">
                    {contract.name || "Unnamed"}
                </h2>
                <span class="badge badge-sm badge-success">Active</span>
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
        {#if contract.description}
            <div class="space-y-1">
                <h3
                    class="text-[10px] uppercase tracking-wider font-bold text-base-content/40"
                >
                    Description
                </h3>
                <p class="text-sm text-base-content/70">
                    {contract.description}
                </p>
            </div>
        {/if}

        <!-- Contract Info -->
        <div class="space-y-1">
            <h3
                class="text-[10px] uppercase tracking-wider font-bold text-base-content/40"
            >
                Contract Address
            </h3>
            <div
                class="flex items-center gap-2 font-mono text-xs bg-base-200/50 p-2 rounded border border-base-content/5 break-all"
            >
                <ShieldCheck class="w-3.5 h-3.5 shrink-0 text-success" />
                {contract.address}
            </div>
        </div>

        <!-- Amount -->
        <div
            class="p-4 rounded-xl bg-success/5 border border-success/10 space-y-1"
        >
            <div class="flex items-center gap-2 text-success/60">
                <Coins class="w-4 h-4" />
                <span class="text-[10px] uppercase tracking-wider font-bold"
                    >Current Balance</span
                >
            </div>
            <p class="text-2xl font-mono font-bold text-success">
                {formatTokenBalance(
                    contract.tokenBalance,
                    contract.tokenDecimals,
                )}
                <span class="text-sm font-normal opacity-60"
                    >{contract.tokenSymbol}</span
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
            <div class="grid grid-cols-1 gap-3">
                <div class="p-3 rounded-lg bg-base-200/50 space-y-1">
                    <span class="text-[10px] text-base-content/40"
                        >Start Date</span
                    >
                    <p class="text-sm font-medium">
                        {formatDate(contract.vestingStart)}
                    </p>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 rounded-lg bg-base-200/50 space-y-1">
                        <span class="text-[10px] text-base-content/40"
                            >Cliff Duration</span
                        >
                        <p class="text-sm font-medium">
                            {formatDuration(contract.cliffDuration)}
                        </p>
                    </div>
                    <div class="p-3 rounded-lg bg-base-200/50 space-y-1">
                        <span class="text-[10px] text-base-content/40"
                            >Vesting Duration</span
                        >
                        <p class="text-sm font-medium">
                            {formatDuration(contract.vestingDuration)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Footer Actions -->
    <footer class="p-4 border-t border-base-content/5 space-y-2">
        <a
            href={`https://sepolia.etherscan.io/address/${contract.address}`}
            target="_blank"
            rel="noreferrer"
            class="btn btn-outline w-full gap-2"
        >
            <ExternalLink class="w-4 h-4" />
            View on Etherscan
        </a>
    </footer>
</div>
