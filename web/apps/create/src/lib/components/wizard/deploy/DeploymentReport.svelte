<script lang="ts">
    import type { Distribution, TokenDetails } from '../../../stores/types';
    import type { TransactionHash } from '@zarf/core/types';
    import { getContractExplorerUrl } from '@zarf/core/contracts/explorer';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import { Download } from 'lucide-svelte';

    interface Props {
        contractAddress: string;
        distribution: Distribution;
        tokenDetails: TokenDetails;
        claimCount: number;
        networkName: string;
        approveTxHash: TransactionHash | null;
        createTxHash: TransactionHash | null;
    }

    let {
        contractAddress,
        distribution,
        tokenDetails,
        claimCount,
        networkName,
        approveTxHash,
        createTxHash,
    }: Props = $props();

    function downloadReport() {
        const timestamp = new Date().toISOString();

        const report = `ZARF VESTING CONTRACT DEPLOYMENT REPORT
========================================

Contract Address: ${contractAddress}
Network: ${networkName}

Distribution Details
--------------------
Name: ${distribution.name}
Description: ${distribution.description || 'N/A'}
Total Amount: ${distribution.amount} ${tokenDetails.tokenSymbol || 'tokens'}
Recipients: ${claimCount}

Token Details
-------------
Symbol: ${tokenDetails.tokenSymbol || 'N/A'}
Address: ${tokenDetails.tokenAddress || 'N/A'}
Decimals: ${tokenDetails.tokenDecimals || 7}

Vesting Schedule
----------------
Cliff Date: ${distribution.schedule.cliffEndDate || 'None'}
Duration: ${distribution.schedule.distributionDuration} ${distribution.schedule.durationUnit}s
Unlock Frequency: Every 1 ${distribution.schedule.durationUnit}

Transaction Hashes
------------------
Approval TX: ${approveTxHash || 'N/A'}
Create TX: ${createTxHash || 'N/A'}

Links
-----
Contract: ${getContractExplorerUrl(contractAddress)}

Generated: ${timestamp}
`;

        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zarf_${contractAddress.slice(0, 8)}_report.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<ZenButton variant="secondary" onclick={downloadReport} title="Download Report">
    {#snippet iconLeft()}<Download class="w-4 h-4" />{/snippet}
</ZenButton>
