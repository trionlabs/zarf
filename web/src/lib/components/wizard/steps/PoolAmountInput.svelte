<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { PERCENTAGE_PRESETS } from "$lib/constants/wizard";

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
    function handleAmountInput(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        const raw = target.value.replace(/[^0-9]/g, "");
        poolAmount = raw ? parseInt(raw) : 0;
        poolInputValue = poolAmount > 0 ? poolAmount.toLocaleString() : "";
    }

    function setPercentage(pct: number) {
        const amt = Math.floor((totalSupply * pct) / 100);
        poolAmount = amt;
        poolInputValue = amt.toLocaleString();
    }

    // Pre-computed for clean markup
    function getPresetClass(pct: number): string {
        const pctAmount = Math.floor((totalSupply * pct) / 100);
        return poolAmount === pctAmount
            ? "bg-primary/10 text-primary font-medium"
            : "text-base-content/40 hover:text-base-content/60 hover:bg-base-content/5";
    }
</script>

<div class="space-y-6">
    <h3
        class="text-xs font-semibold uppercase tracking-widest text-base-content/40 flex items-center gap-2"
    >
        <span
            class="w-4 h-4 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center"
            >1</span
        >
        Distribution Pool
    </h3>

    <!-- Amount Input -->
    <div class="flex items-baseline gap-3">
        <input
            type="text"
            value={poolInputValue}
            oninput={handleAmountInput}
            placeholder="0"
            aria-label="Distribution Pool Amount"
            class="input input-ghost h-auto p-0 rounded-none w-80 text-3xl font-light font-mono border-b-2 border-base-content/10 focus:border-primary/50 focus:bg-transparent outline-none transition-colors text-right placeholder:text-base-content/20"
        />
        <span class="text-base-content/50 text-lg font-medium">
            {tokenSymbol}
        </span>
    </div>

    <!-- Quick Presets (% Supply) -->
    {#if hasSupply}
        <div class="flex items-center gap-4">
            <span
                class="text-xs text-base-content/30 uppercase tracking-widest w-16 shrink-0"
                >Quick</span
            >
            <div class="flex items-center gap-1">
                {#each PERCENTAGE_PRESETS as pct}
                    <button
                        type="button"
                        class="px-2 py-1 text-xs font-mono rounded transition-all {getPresetClass(
                            pct,
                        )}"
                        onclick={() => setPercentage(pct)}
                    >
                        {pct}%
                    </button>
                {/each}

                <!-- Custom % Input -->
                <div class="flex items-center gap-1 ml-1">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="%"
                        aria-label="Custom Percentage"
                        class="w-10 px-1 py-1 text-xs font-mono text-center bg-transparent border border-base-content/10 rounded focus:border-primary outline-none transition-all hover:border-base-content/30"
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
        <p class="text-xs text-base-content/30 pl-20">
            Total Supply: {totalSupply.toLocaleString()}
            {tokenSymbol}
        </p>
    {/if}
</div>
