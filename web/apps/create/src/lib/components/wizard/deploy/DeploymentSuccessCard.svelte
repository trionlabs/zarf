<script lang="ts">
    import type { Distribution, TokenDetails } from '../../../stores/types';
    import { getContractExplorerUrl } from '@zarf/core/contracts/explorer';
    import { Check, Copy, ExternalLink, Calendar } from 'lucide-svelte';
    import { formatAmount } from '@zarf/core/utils';

    interface Props {
        contractAddress: string;
        distribution: Distribution;
        tokenDetails: TokenDetails;
        recipientCount: number;
        batchCount: number;
        visibleRecipients: { email: string; amount: number }[];
        remainingCount: number;
    }

    let {
        contractAddress,
        distribution,
        tokenDetails,
        recipientCount,
        batchCount,
        visibleRecipients,
        remainingCount,
    }: Props = $props();

    let copied = $state(false);
    function copyAddress() {
        navigator.clipboard.writeText(contractAddress);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    function getIdenticonColors(address: string): string[] {
        const colors = [];
        for (let i = 0; i < 8; i++) {
            const value = address.charCodeAt(i % address.length) + i * 17;
            const lightness = 20 + (value % 60);
            const hue = (value * 2.8) % 360;
            colors.push(`oklch(${lightness}% 0.08 ${hue})`);
        }
        return colors;
    }
</script>

<div
    class="bg-zen-bg-elevated border-[0.5px] border-zen-border-subtle rounded-2xl overflow-hidden sticky top-8"
>
    <!-- Header: Identicon + Name + Address -->
    <div class="p-5 border-b border-zen-border-subtle">
        <div class="flex items-start gap-4">
            <!-- Identicon Grid -->
            <div class="w-14 h-14 rounded-xl overflow-hidden grid grid-cols-4 grid-rows-4 shrink-0">
                {#each getIdenticonColors(contractAddress) as color, i}
                    <div style="background-color: {color}"></div>
                {/each}
            </div>

            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-lg text-zen-fg truncate">
                    {distribution.name}
                </h3>
                <div class="flex items-center gap-2 mt-1">
                    <code class="text-xs font-mono text-zen-fg-muted truncate">
                        {contractAddress.slice(0, 10)}...{contractAddress.slice(-8)}
                    </code>
                    <button
                        type="button"
                        onclick={copyAddress}
                        class="p-1 text-zen-fg-subtle hover:text-zen-fg transition-colors"
                        title={copied ? 'Copied!' : 'Copy'}
                        aria-label={copied ? 'Address copied' : 'Copy contract address'}
                    >
                        {#if copied}
                            <Check class="w-3 h-3" />
                        {:else}
                            <Copy class="w-3 h-3" />
                        {/if}
                    </button>
                    <a
                        href={getContractExplorerUrl(contractAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="p-1 text-zen-fg-subtle hover:text-zen-fg transition-colors"
                        aria-label="Open contract in Stellar explorer"
                    >
                        <ExternalLink class="w-3 h-3" />
                    </a>
                </div>
            </div>
        </div>
    </div>

    <!-- Stats Row -->
    <div
        class="grid grid-cols-3 divide-x divide-zen-border-subtle border-b border-zen-border-subtle"
    >
        <div class="p-4 text-center">
            <div class="text-lg font-bold text-zen-fg">
                {formatAmount(distribution.amount)}
            </div>
            <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mt-0.5">
                {tokenDetails.tokenSymbol || 'Tokens'}
            </div>
        </div>
        <div class="p-4 text-center">
            <div class="text-lg font-bold text-zen-fg">
                {recipientCount}
            </div>
            <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mt-0.5">
                {recipientCount === 1 ? 'Recipient' : 'Recipients'}
            </div>
            {#if batchCount !== recipientCount}
                <div class="text-[9px] text-zen-fg-subtle mt-0.5">
                    {batchCount} batches
                </div>
            {/if}
        </div>
        <div class="p-4 text-center">
            <div class="text-lg font-bold text-zen-fg">
                {distribution.schedule.distributionDuration}
            </div>
            <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mt-0.5">
                {distribution.schedule.durationUnit}s
            </div>
        </div>
    </div>

    <!-- Recipient Preview -->
    <div class="p-4 border-b border-zen-border-subtle">
        <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mb-3">Recipients</div>
        <div class="space-y-2">
            {#each visibleRecipients as recipient}
                <div class="flex items-center justify-between text-sm">
                    <span class="text-zen-fg-muted truncate max-w-[140px]">
                        {recipient.email}
                    </span>
                    <span class="font-mono text-zen-fg text-xs">
                        {recipient.amount.toLocaleString('en-US')}
                        {tokenDetails.tokenSymbol || ''}
                    </span>
                </div>
            {/each}
            {#if remainingCount > 0}
                <div class="text-xs text-zen-fg-subtle pt-1">
                    +{remainingCount} more
                </div>
            {/if}
        </div>
    </div>

    <!-- Schedule Info -->
    <div class="p-4 bg-zen-bg/50">
        <div class="flex items-center justify-between text-sm">
            <div class="flex items-center gap-2 text-zen-fg-muted">
                <Calendar aria-hidden="true" class="w-4 h-4" />
                <span>Cliff</span>
            </div>
            <span class="font-medium text-zen-fg">
                {distribution.schedule.cliffEndDate
                    ? new Date(distribution.schedule.cliffEndDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                      })
                    : 'No cliff'}
            </span>
        </div>
    </div>
</div>
