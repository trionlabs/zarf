<script lang="ts">
    import { wizardStore } from "../../stores/wizardStore.svelte";
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

    // Aggregates from saved distributions
    const distributions = $derived(wizardStore.distributions);
    const totalDistributions = $derived(distributions.length);

    // Saved recipients count
    const savedRecipients = $derived(
        distributions.reduce((acc, d) => acc + d.recipients.length, 0),
    );

    // Total Recipients (Saved + Editing)
    const totalRecipients = $derived(
        savedRecipients + wizardStore.editingRecipientCount,
    );

    const savedAmount = $derived(
        distributions.reduce((acc, d) => acc + parseFloat(d.amount || "0"), 0),
    );

    // Total Amount (Saved + Editing)
    const totalAmount = $derived(savedAmount + wizardStore.editingPoolAmount);
    const distributionAmountDisplay = $derived(
        totalAmount > 0 ? totalAmount.toLocaleString() : "—",
    );

    // Schedule Summary (combines saved + editing)
    const scheduleSummary = $derived.by(() => {
        // Collect durations from saved distributions (always stored in months)
        const savedDurations = distributions.map(
            (d) => d.schedule.distributionDuration,
        );

        // If we're editing, show the editing duration with its unit
        if (wizardStore.editingVestingDuration > 0) {
            const editDuration = wizardStore.editingVestingDuration;
            const editUnit = wizardStore.editingDurationUnit || "months";

            // Format unit label
            const unitLabels: Record<string, string> = {
                weeks: "Weeks",
                months: "Months",
                quarters: "Quarters",
                years: "Years",
            };
            const unitLabel = unitLabels[editUnit] || "Months";

            // If there are saved distributions, show a range
            if (savedDurations.length > 0) {
                // Convert editing duration to months for comparison
                const editInMonths =
                    editUnit === "weeks"
                        ? editDuration / 4
                        : editUnit === "quarters"
                          ? editDuration * 3
                          : editUnit === "years"
                            ? editDuration * 12
                            : editDuration;

                const allMonths = [...savedDurations, editInMonths];
                const min = Math.min(...allMonths);
                const max = Math.max(...allMonths);

                if (min === max) return `${Math.round(min)} Months`;
                return `${Math.round(min)} - ${Math.round(max)} Months`;
            }

            // Only editing, show with current unit
            return `${editDuration} ${unitLabel}`;
        }

        // Only saved distributions
        if (savedDurations.length === 0) return "—";

        const min = Math.min(...savedDurations);
        const max = Math.max(...savedDurations);

        if (min === max) return `${min} Months`;
        return `${min} - ${max} Months`;
    });

    // UI State - Panel shows data when we have token, distributions, OR editing state
    const isEditing = $derived(
        wizardStore.editingPoolAmount > 0 ||
            wizardStore.editingVestingDuration > 0 ||
            wizardStore.editingRecipientCount > 0,
    );

    const hasData = $derived(
        wizardStore.tokenDetails.tokenAddress !== null ||
            totalDistributions > 0 ||
            isEditing,
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
        class="flex items-center justify-between py-3 border-b-[0.5px] border-zen-border-subtle group last:border-0"
    >
        <div class="flex items-center gap-2">
            <Icon class="w-3.5 h-3.5 opacity-30" />
            <span class="text-xs text-zen-fg-muted">{label}</span>
        </div>
        <span
            class="transition-colors text-right
            {options.isMono ? 'font-mono' : 'font-medium'} 
            {options.highlight ? 'text-zen-primary' : ''}
            {value !== '—' && value !== 0
                ? 'text-zen-fg'
                : 'text-zen-fg-muted text-xs'}"
            title={options.title}
            class:text-sm={value !== "—"}
        >
            {value}{options.subValue || ""}
        </span>
    </div>
{/snippet}

<div class="space-y-5">
    <h3
        class="text-[10px] font-semibold uppercase tracking-[0.15em] text-zen-fg-subtle"
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
            class="text-[10px] text-zen-fg-muted text-center pt-2 border-t border-zen-border-subtle mt-2 border-dashed"
        >
            Waiting for configuration...
        </div>
    {/if}
</div>
