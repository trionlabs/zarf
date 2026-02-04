<script lang="ts">
    import { wizardStore } from "../../../stores/wizardStore.svelte";
    import { PERCENTAGE_PRESETS } from "@zarf/core/constants/wizard";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenNumberInput from "@zarf/ui/components/ui/ZenNumberInput.svelte";

    let { poolAmount = $bindable(), poolInputValue = $bindable() } = $props<{
        poolAmount: number;
        poolInputValue: string;
    }>();

    // --- Derived ---
    const totalSupply = $derived(
        wizardStore.tokenDetails.tokenTotalSupply
            ? Number(
                  String(wizardStore.tokenDetails.tokenTotalSupply).replace(
                      /,/g,
                      "",
                  ),
              )
            : 0,
    );

    const tokenSymbol = $derived(
        wizardStore.tokenDetails.tokenSymbol || "TOKENS",
    );
    const hasSupply = $derived(totalSupply > 0);

    // --- Actions ---
    import { untrack } from "svelte";

    // --- Actions ---
    function handleAmountInput(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        // Allow numbers and one decimal point
        const raw = target.value.replace(
            /[^0-9.]/g,
            (match, offset, string) => {
                if (match === "." && string.indexOf(".") !== offset) return "";
                return match;
            },
        );

        // Update local bound value immediately to prevent jitter
        // But only update numeric state if valid
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) {
            poolAmount = parsed;
        } else if (raw === "") {
            poolAmount = 0;
        }

        poolInputValue = raw;
    }

    function setPercentage(pct: number) {
        const amt = (totalSupply * pct) / 100;
        // Round to 4 decimals max for presets to avoid ugly floats
        poolAmount = Number(amt.toFixed(4));
        poolInputValue = poolAmount.toString();
    }

    // --- Synchronization ---
    // Ensure input value stays in sync if poolAmount is updated externally (e.g. restoration)
    $effect(() => {
        const amt = poolAmount;
        untrack(() => {
            // Only sync if the numeric values mismatch significantly (ignoring formatting like "100" vs "100.")
            const currentInput = parseFloat(poolInputValue);
            if (amt > 0 && Math.abs(currentInput - amt) > 0.000001) {
                // If they differ (and it's not just a trailing dot issue), sync up
                // Verify we aren't overwriting a user trying to type a decimal
                if (
                    !poolInputValue.endsWith(".") &&
                    !poolInputValue.endsWith(".0")
                ) {
                    poolInputValue = amt.toString();
                }
            } else if (
                amt === 0 &&
                poolInputValue !== "" &&
                parseFloat(poolInputValue) !== 0
            ) {
                // Handle reset to 0
                poolInputValue = "";
            }
        });
    });

    // Pre-computed for clean markup
    function getPresetClass(pct: number): string {
        const pctAmount = Math.floor((totalSupply * pct) / 100);
        return poolAmount === pctAmount
            ? "bg-zen-fg text-zen-bg shadow-sm"
            : "bg-zen-fg/5 text-zen-fg-subtle hover:bg-zen-fg/10";
    }
</script>

<div class="space-y-3">
    <h3 class="zen-section-label">Distribution Pool</h3>

    <!-- Amount Input -->
    <div class="flex items-baseline gap-3">
        <input
            type="text"
            value={poolInputValue}
            oninput={handleAmountInput}
            placeholder="0"
            aria-label="Distribution Pool Amount"
            class="w-80 bg-transparent border-none !text-5xl font-medium tracking-tighter leading-none text-right placeholder:text-zen-fg/10 text-zen-fg focus:outline-none focus:ring-0 transition-all"
        />
        <span class="text-zen-fg/50 text-lg font-medium">
            {tokenSymbol}
        </span>
    </div>

    <!-- Quick Presets (% Supply) -->
    {#if hasSupply}
        <div class="flex items-center gap-3">
            <span
                class="text-xs text-zen-fg-muted uppercase tracking-widest w-16 shrink-0"
                >Quick</span
            >
            <div class="flex items-center gap-1">
                {#each PERCENTAGE_PRESETS as pct}
                    <button
                        type="button"
                        class="px-3 py-1.5 text-xs font-medium rounded-full transition-all {getPresetClass(
                            pct,
                        )}"
                        onclick={() => setPercentage(pct)}
                    >
                        {pct}%
                    </button>
                {/each}

                <!-- Custom % Input -->
                <div class="flex items-center gap-1 ml-1">
                    <ZenNumberInput
                        min={0}
                        max={100}
                        size="sm"
                        variant="ghost"
                        suffix="%"
                        align="center"
                        placeholder="%"
                        aria-label="Custom Percentage"
                        class="w-14"
                        onchange={(e) =>
                            setPercentage(
                                parseFloat(
                                    (e.currentTarget as HTMLInputElement).value,
                                ) || 0,
                            )}
                    />
                </div>
            </div>
        </div>
        <p class="text-xs text-zen-fg-muted pl-20">
            Total Supply: {totalSupply.toLocaleString()}
            {tokenSymbol}
        </p>
    {/if}
</div>
