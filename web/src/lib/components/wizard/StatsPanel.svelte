<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import {
        Wallet,
        Users,
        Coins,
        FileText,
        Package,
        Calendar,
    } from "lucide-svelte";
    import type { ComponentType } from "svelte";

    // ——————————————————————————————————————————————————————————————————————————
    // Derived Stats
    // ——————————————————————————————————————————————————————————————————————————

    // Token Identity
    const tokenName = $derived(wizardStore.tokenDetails.tokenName || "—");
    const tokenSymbol = $derived(wizardStore.tokenDetails.tokenSymbol || "");
    const tokenTotalSupply = $derived(
        wizardStore.tokenDetails.tokenTotalSupply || "—",
    );

    // Address Formatting
    const tokenAddress = $derived.by(() => {
        const addr = wizardStore.tokenDetails.tokenAddress;
        if (!addr) return "—";
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    });

    // Aggregates
    const distributions = $derived(wizardStore.distributions);
    const totalDistributions = $derived(distributions.length);

    const totalRecipients = $derived(
        distributions.reduce((acc, d) => acc + d.recipients.length, 0),
    );

    const savedAmount = $derived(
        distributions.reduce((acc, d) => acc + parseFloat(d.amount || "0"), 0),
    );

    // Total Amount (Saved + Editing)
    const totalAmount = $derived(savedAmount + wizardStore.editingPoolAmount);
    const distributionAmountDisplay = $derived(
        totalAmount > 0 ? totalAmount.toLocaleString() : "—",
    );

    // Schedule Summary (New Insight)
    const scheduleSummary = $derived.by(() => {
        if (distributions.length === 0) return "—";

        const durations = distributions.map(
            (d) => d.schedule.distributionDurationMonths,
        );
        const min = Math.min(...durations);
        const max = Math.max(...durations);

        if (min === max) return `${min} Months`;
        return `${min} - ${max} Months`;
    });

    // UI State
    const hasData = $derived(
        wizardStore.tokenDetails.tokenAddress !== null ||
            totalDistributions > 0 ||
            wizardStore.editingPoolAmount > 0,
    );
</script>

{#snippet statRow(
    Icon: ComponentType,
    label: string,
    value: string | number,
    options: {
        highlight?: boolean;
        isMono?: boolean;
        subValue?: string;
        title?: string;
    } = {},
)}
    <div
        class="flex items-center justify-between py-3 border-b-[0.5px] border-base-content/5 group last:border-0"
    >
        <div class="flex items-center gap-2">
            <Icon class="w-3.5 h-3.5 opacity-30" />
            <span class="text-xs text-base-content/50">{label}</span>
        </div>
        <span
            class="transition-colors text-right
            {options.isMono ? 'font-mono' : 'font-medium'} 
            {options.highlight ? 'text-primary' : ''}
            {value !== '—' && value !== 0
                ? 'text-base-content'
                : 'text-base-content/30 text-xs'}"
            title={options.title}
            class:text-sm={value !== "—"}
        >
            {value}{options.subValue || ""}
        </span>
    </div>
{/snippet}

<div class="space-y-5">
    <h3
        class="text-[10px] font-semibold uppercase tracking-[0.15em] text-base-content/40"
    >
        Basket Summary
    </h3>

    <div class="space-y-0.5">
        <!-- Token Details -->
        {@render statRow(FileText, "Token", tokenName, {
            subValue: tokenSymbol ? ` (${tokenSymbol})` : "",
            title: wizardStore.tokenDetails.tokenName || "",
        })}

        {@render statRow(Wallet, "Contract", tokenAddress, { isMono: true })}

        {@render statRow(Package, "Total Supply", tokenTotalSupply, {
            isMono: true,
        })}

        <!-- Distribution Stats -->
        {@render statRow(
            Coins,
            "Total Distributing",
            distributionAmountDisplay,
            {
                highlight: distributionAmountDisplay !== "—",
                isMono: true,
            },
        )}

        {@render statRow(Calendar, "Vesting Range", scheduleSummary)}

        {@render statRow(Users, "Total Recipients", totalRecipients)}

        {@render statRow(FileText, "Distributions", totalDistributions)}
    </div>

    <!-- Empty State Hint -->
    {#if !hasData}
        <div
            class="text-[10px] text-base-content/30 text-center pt-2 border-t border-base-content/5 mt-2 border-dashed"
        >
            Waiting for configuration...
        </div>
    {/if}
</div>
