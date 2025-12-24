<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { Wallet, Users, Coins, FileText, Package } from "lucide-svelte";

    // Derived stats from wizard store
    const tokenName = $derived(wizardStore.tokenDetails.tokenName || "—");
    const tokenSymbol = $derived(wizardStore.tokenDetails.tokenSymbol || "");
    const tokenAddress = $derived(
        wizardStore.tokenDetails.tokenAddress
            ? `${wizardStore.tokenDetails.tokenAddress.slice(0, 6)}...${wizardStore.tokenDetails.tokenAddress.slice(-4)}`
            : "—",
    );
    const tokenTotalSupply = $derived(
        wizardStore.tokenDetails.tokenTotalSupply || "—",
    );

    // Aggregated Stats from Distributions Basket + current editing
    const totalDistributions = $derived(wizardStore.distributions.length);
    const totalRecipients = $derived(
        wizardStore.distributions.reduce(
            (acc, d) => acc + d.recipients.length,
            0,
        ),
    );
    const savedAmount = $derived(
        wizardStore.distributions.reduce(
            (acc, d) => acc + parseFloat(d.amount || "0"),
            0,
        ),
    );

    // Total includes both saved distributions AND current being edited
    const totalAmount = $derived(savedAmount + wizardStore.editingPoolAmount);

    const distributionAmountDisplay = $derived(
        totalAmount > 0 ? totalAmount.toLocaleString() : "—",
    );

    // Check if any data is entered
    const hasData = $derived(
        wizardStore.tokenDetails.tokenAddress !== null ||
            totalDistributions > 0 ||
            wizardStore.editingPoolAmount > 0,
    );
</script>

<div class="space-y-5">
    <h3
        class="text-[10px] font-semibold uppercase tracking-[0.15em] text-base-content/40"
    >
        Basket Summary
    </h3>

    <div class="space-y-1">
        <!-- Token Name & Symbol -->
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
                title={wizardStore.tokenDetails.tokenName || ""}
            >
                {tokenName}{tokenSymbol ? ` (${tokenSymbol})` : ""}
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

        <!-- Token Total Supply -->
        <div
            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group"
        >
            <div class="flex items-center gap-2">
                <Package class="w-3.5 h-3.5 opacity-30" />
                <span class="text-xs text-base-content/50">Total Supply</span>
            </div>
            <span
                class="text-xs font-mono transition-colors {tokenTotalSupply !==
                '—'
                    ? 'text-base-content/70'
                    : 'text-base-content/30'}"
            >
                {tokenTotalSupply}
            </span>
        </div>

        <!-- Total Distribute Amount -->
        <div
            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group"
        >
            <div class="flex items-center gap-2">
                <Coins class="w-3.5 h-3.5 opacity-30" />
                <span class="text-xs text-base-content/50"
                    >Total Distributing</span
                >
            </div>
            <span
                class="text-sm font-mono font-medium transition-colors {distributionAmountDisplay !==
                '—'
                    ? 'text-primary'
                    : 'text-base-content/30'}"
            >
                {distributionAmountDisplay}
            </span>
        </div>

        <!-- Total Recipients -->
        <div
            class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group"
        >
            <div class="flex items-center gap-2">
                <Users class="w-3.5 h-3.5 opacity-30" />
                <span class="text-xs text-base-content/50"
                    >Total Recipients</span
                >
            </div>
            <span
                class="text-sm font-medium tabular-nums transition-colors {totalRecipients >
                0
                    ? 'text-base-content'
                    : 'text-base-content/30'}"
            >
                {totalRecipients}
            </span>
        </div>

        <!-- Distributions Count -->
        <div class="flex items-center justify-between py-3">
            <span class="text-xs text-base-content/50">Distributions</span>
            <span
                class="text-sm font-medium truncate max-w-[120px] transition-colors {totalDistributions >
                0
                    ? 'text-base-content'
                    : 'text-base-content/30'}"
            >
                {totalDistributions}
            </span>
        </div>
    </div>

    <!-- Empty State Hint -->
    {#if !hasData}
        <p class="text-[10px] text-base-content/30 text-center pt-2">
            Enter contract address to see preview
        </p>
    {/if}
</div>
