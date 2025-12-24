<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { Check, X } from "lucide-svelte";

    // Validation rules for Step 0 (Token Entry)
    const validations = $derived([
        {
            label: "Contract address",
            valid:
                wizardStore.tokenDetails.tokenAddress !== null &&
                wizardStore.tokenDetails.tokenAddress.startsWith("0x") &&
                wizardStore.tokenDetails.tokenAddress.length === 42,
            touched:
                wizardStore.tokenDetails.tokenAddress !== null &&
                wizardStore.tokenDetails.tokenAddress.length > 0,
        },
        {
            label: "Token verified",
            valid: wizardStore.tokenDetails.tokenName !== null,
            touched:
                wizardStore.tokenDetails.tokenAddress !== null &&
                wizardStore.tokenDetails.tokenAddress.length === 42,
        },
    ]);

    const allValid = $derived(validations.every((v) => v.valid));
    const validCount = $derived(validations.filter((v) => v.valid).length);

    // Helper to get icon container classes
    function getIconClasses(item: {
        valid: boolean;
        touched: boolean;
    }): string {
        if (item.valid) return "bg-success/20 text-success";
        if (item.touched) return "bg-error/20 text-error";
        return "bg-base-content/10";
    }
</script>

<div class="space-y-4">
    <div class="flex items-center justify-between">
        <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">
            Validation
        </h3>
        <span
            class="text-[10px] font-medium {allValid
                ? 'text-success'
                : 'text-warning'}"
        >
            {validCount}/{validations.length}
        </span>
    </div>

    <div class="space-y-2">
        {#each validations as item}
            <div
                class="flex items-center gap-2 py-1.5 transition-all duration-300 {!item.touched &&
                !item.valid
                    ? 'opacity-40'
                    : ''}"
            >
                <!-- Icon -->
                <div
                    class="w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 {getIconClasses(
                        item,
                    )}"
                >
                    {#if item.valid}
                        <Check class="w-2.5 h-2.5" />
                    {:else if item.touched}
                        <X class="w-2.5 h-2.5" />
                    {:else}
                        <div class="w-1 h-1 rounded-full bg-current"></div>
                    {/if}
                </div>

                <!-- Label -->
                <span
                    class="text-xs transition-all {item.valid
                        ? 'line-through opacity-50'
                        : ''}"
                >
                    {item.label}
                </span>
            </div>
        {/each}
    </div>

    <!-- Status Badge -->
    {#if allValid}
        <div
            class="mt-4 py-2 px-3 rounded-lg bg-success/10 border border-success/20 text-center"
        >
            <span class="text-xs font-medium text-success"
                >Ready to proceed</span
            >
        </div>
    {/if}
</div>
