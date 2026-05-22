<script lang="ts">
    import { X, Calendar, Coins, ExternalLink, ShieldCheck, FileJson } from 'lucide-svelte';
    import type { OnChainVestingContract } from '@zarf/core/services/distributionDiscovery';
    import { getCidForVesting } from '@zarf/core/services/vestingDiscovery';
    import { fetchIpfsJson } from '@zarf/core/utils/ipfsFetch';
    import { getContractExplorerUrl } from '@zarf/core/contracts';
    import { formatTokenAmount } from '@zarf/core/utils/amount';

    let {
        contract,
        onClose,
    }: {
        contract: OnChainVestingContract;
        onClose: () => void;
    } = $props();

    interface OffChainSchedule {
        vestingStart: number;
        cliffDuration: number;
        vestingDuration: number;
        vestingPeriod: number;
        totalPeriods: number;
    }

    let cid = $state<string | null>(null);
    let schedule = $state<OffChainSchedule | null>(null);
    let loadingSchedule = $state(true);
    let scheduleError = $state<string | null>(null);
    let scheduleRequest = 0;

    $effect(() => {
        const address = contract.address;
        const requestId = ++scheduleRequest;

        cid = null;
        schedule = null;
        scheduleError = null;
        loadingSchedule = true;

        (async () => {
            try {
                const found = await getCidForVesting(address);
                if (requestId !== scheduleRequest) return;

                cid = found;
                if (!found) {
                    scheduleError = 'No IPFS metadata found for this vesting';
                    return;
                }

                const data = await fetchIpfsJson<{ schedule: OffChainSchedule }>(found);
                if (requestId !== scheduleRequest) return;
                schedule = data.schedule;
            } catch (e) {
                if (requestId !== scheduleRequest) return;
                scheduleError = (e as Error).message;
            } finally {
                if (requestId === scheduleRequest) {
                    loadingSchedule = false;
                }
            }
        })();

        return () => {
            scheduleRequest++;
        };
    });

    function formatDuration(seconds: number): string {
        if (seconds <= 0) return '—';
        const days = seconds / 86400;
        if (days >= 1) return `${days.toFixed(2)} days`;
        const hours = seconds / 3600;
        if (hours >= 1) return `${hours.toFixed(1)} hours`;
        const minutes = seconds / 60;
        return `${minutes.toFixed(0)} min`;
    }

    function formatDate(timestamp: number): string {
        if (!timestamp || timestamp === 0) return '—';
        return new Date(timestamp * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    const ipfsGatewayUrl = $derived(cid ? `https://ipfs.io/ipfs/${cid}` : null);
</script>

<div class="h-full flex flex-col bg-zen-bg">
    <!-- Header -->
    <header class="p-4 border-b-[0.5px] border-zen-border-subtle flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div
                class="w-10 h-10 rounded-xl bg-zen-success/10 flex items-center justify-center text-zen-success font-bold"
            >
                {(contract.name || 'U').charAt(0)}
            </div>
            <div>
                <h2 class="font-semibold text-base">
                    {contract.name || 'Unnamed'}
                </h2>
                <span
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-zen-success/10 text-zen-success"
                    >Active</span
                >
            </div>
        </div>
        <button class="p-2 rounded-full hover:bg-zen-fg/5 transition-colors" onclick={onClose}>
            <X class="w-4 h-4" />
        </button>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6">
        {#if contract.description}
            <div class="space-y-1">
                <h3 class="text-[10px] uppercase tracking-wider font-bold text-zen-fg-subtle">
                    Description
                </h3>
                <p class="text-sm text-zen-fg-muted">
                    {contract.description}
                </p>
            </div>
        {/if}

        <!-- Contract Address -->
        <div class="space-y-1">
            <h3 class="text-[10px] uppercase tracking-wider font-bold text-zen-fg-subtle">
                Contract Address
            </h3>
            <div
                class="flex items-center gap-2 font-mono text-xs bg-zen-fg/5 p-2 rounded border-[0.5px] border-zen-border-subtle break-all"
            >
                <ShieldCheck class="w-3.5 h-3.5 shrink-0 text-zen-success" />
                {contract.address}
            </div>
        </div>

        <!-- Balance -->
        <div class="p-4 rounded-xl bg-zen-success/5 border-[0.5px] border-zen-success/10 space-y-1">
            <div class="flex items-center gap-2 text-zen-success/60">
                <Coins class="w-4 h-4" />
                <span class="text-[10px] uppercase tracking-wider font-bold">Current Balance</span>
            </div>
            <p class="text-2xl font-mono font-bold text-zen-success">
                {formatTokenAmount(contract.tokenBalance, contract.tokenDecimals, 4)}
                <span class="text-sm font-normal opacity-60">{contract.tokenSymbol}</span>
            </p>
        </div>

        <!-- Schedule (off-chain via IPFS) -->
        <div class="space-y-3">
            <h3
                class="text-[10px] uppercase tracking-wider font-bold text-zen-fg-subtle flex items-center gap-2"
            >
                <Calendar class="w-3.5 h-3.5" />
                Schedule
            </h3>

            {#if loadingSchedule}
                <p class="text-xs text-zen-fg-subtle">Loading from IPFS...</p>
            {:else if scheduleError}
                <p class="text-xs text-zen-error">{scheduleError}</p>
            {:else if schedule}
                <div class="grid grid-cols-1 gap-3">
                    <div class="p-3 rounded-lg bg-zen-fg/5 space-y-1">
                        <span class="text-[10px] text-zen-fg-subtle">Start Date</span>
                        <p class="text-sm font-medium">
                            {formatDate(schedule.vestingStart)}
                        </p>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 rounded-lg bg-zen-fg/5 space-y-1">
                            <span class="text-[10px] text-zen-fg-subtle">Cliff Duration</span>
                            <p class="text-sm font-medium">
                                {formatDuration(schedule.cliffDuration)}
                            </p>
                        </div>
                        <div class="p-3 rounded-lg bg-zen-fg/5 space-y-1">
                            <span class="text-[10px] text-zen-fg-subtle">Vesting Duration</span>
                            <p class="text-sm font-medium">
                                {formatDuration(schedule.vestingDuration)}
                            </p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 rounded-lg bg-zen-fg/5 space-y-1">
                            <span class="text-[10px] text-zen-fg-subtle">Period</span>
                            <p class="text-sm font-medium">
                                {formatDuration(schedule.vestingPeriod)}
                            </p>
                        </div>
                        <div class="p-3 rounded-lg bg-zen-fg/5 space-y-1">
                            <span class="text-[10px] text-zen-fg-subtle">Total Periods</span>
                            <p class="text-sm font-medium">
                                {schedule.totalPeriods}
                            </p>
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <!-- IPFS metadata link -->
        {#if cid}
            <div class="space-y-1">
                <h3
                    class="text-[10px] uppercase tracking-wider font-bold text-zen-fg-subtle flex items-center gap-2"
                >
                    <FileJson class="w-3.5 h-3.5" />
                    IPFS Metadata
                </h3>
                <div
                    class="flex items-center gap-2 font-mono text-xs bg-zen-fg/5 p-2 rounded border-[0.5px] border-zen-border-subtle break-all"
                >
                    {cid}
                </div>
            </div>
        {/if}
    </div>

    <!-- Footer Actions -->
    <footer class="p-4 border-t-[0.5px] border-zen-border-subtle space-y-2">
        <a
            href={getContractExplorerUrl(contract.address)}
            target="_blank"
            rel="noreferrer"
            class="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border border-zen-border text-zen-fg-muted hover:bg-zen-fg/5 transition-colors text-sm font-medium"
        >
            <ExternalLink class="w-4 h-4" />
            View on Stellar Explorer
        </a>
        {#if ipfsGatewayUrl}
            <a
                href={ipfsGatewayUrl}
                target="_blank"
                rel="noreferrer"
                class="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border border-zen-border text-zen-fg-muted hover:bg-zen-fg/5 transition-colors text-sm font-medium"
            >
                <FileJson class="w-4 h-4" />
                View Metadata on IPFS
            </a>
        {/if}
    </footer>
</div>
