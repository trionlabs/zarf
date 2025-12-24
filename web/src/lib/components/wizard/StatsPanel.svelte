<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { Wallet, Users, Coins, FileText } from "lucide-svelte";

    // Derived stats from wizard store
    const tokenName = $derived(
        wizardStore.tokenDetails.distributionName || "—",
    );
    const tokenAddress = $derived(
        wizardStore.tokenDetails.tokenAddress
            ? `${wizardStore.tokenDetails.tokenAddress.slice(0, 6)}...${wizardStore.tokenDetails.tokenAddress.slice(-4)}`
            : "—",
    );
    const totalSupply = $derived(
        wizardStore.tokenDetails.totalAmount
            ? Number(wizardStore.tokenDetails.totalAmount).toLocaleString()
            : "—",
    );
    const recipientCount = $derived(wizardStore.recipients.length);
    const totalDistribution = $derived(
        wizardStore.totalRecipientsAmount > 0
            ? wizardStore.totalRecipientsAmount.toLocaleString()
            : "—",
    );

    // Check if any data is entered
    const hasData = $derived(
        wizardStore.tokenDetails.distributionName.length > 0 ||
            wizardStore.tokenDetails.tokenAddress !== null,
    );
</script>

<div class="space-y-5">
    <h3
        class="text-[10px] font-semibold uppercase tracking-[0.15em] text-base-content/40"
    >
        Distribution Summary
    </h3>

    <div class="space-y-1">
        <!-- Token Name -->
        <div
            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group"
        >
            <div class="flex items-center gap-2">
                <FileText class="w-3.5 h-3.5 opacity-30" />
                <span class="text-xs text-base-content/50">Token</span>
            </div>
            <span
                class="text-sm font-medium truncate max-w-[120px] transition-colors {tokenName !==
                '—'
                    ? 'text-base-content'
                    : 'text-base-content/30'}"
                title={wizardStore.tokenDetails.distributionName}
            >
                {tokenName}
            </span>
        </div>

        <!-- Address -->
        <div
            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group"
        >
            <div class="flex items-center gap-2">
                <Wallet class="w-3.5 h-3.5 opacity-30" />
                <span class="text-xs text-base-content/50">Contract</span>
            </div>
            <span
                class="text-xs font-mono transition-colors {tokenAddress !== '—'
                    ? 'text-base-content'
                    : 'text-base-content/30'}"
            >
                {tokenAddress}
            </span>
        </div>

        <!-- Supply -->
        <div
            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group"
        >
            <div class="flex items-center gap-2">
                <Coins class="w-3.5 h-3.5 opacity-30" />
                <span class="text-xs text-base-content/50">Supply</span>
            </div>
            <span
                class="text-sm font-mono transition-colors {totalSupply !== '—'
                    ? 'text-base-content'
                    : 'text-base-content/30'}"
            >
                {totalSupply}
            </span>
        </div>

        <!-- Recipients -->
        <div
            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group"
        >
            <div class="flex items-center gap-2">
                <Users class="w-3.5 h-3.5 opacity-30" />
                <span class="text-xs text-base-content/50">Recipients</span>
            </div>
            <span
                class="text-sm font-medium tabular-nums transition-colors {recipientCount >
                0
                    ? 'text-base-content'
                    : 'text-base-content/30'}"
            >
                {recipientCount}
            </span>
        </div>

        <!-- Total Distribution -->
        <div class="flex items-center justify-between py-3">
            <span class="text-xs text-base-content/50">To Distribute</span>
            <span
                class="text-sm font-mono font-medium tabular-nums transition-colors {totalDistribution !==
                '—'
                    ? 'text-primary'
                    : 'text-base-content/30'}"
            >
                {totalDistribution}
            </span>
        </div>
    </div>

    <!-- Empty State Hint -->
    {#if !hasData}
        <p class="text-[10px] text-base-content/30 text-center pt-2">
            Fill in the form to see preview
        </p>
    {/if}
</div>
