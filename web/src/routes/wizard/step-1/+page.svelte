<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    onMount(() => {
        wizardStore.goToStep(1);
    });

    let distributionName = $state(wizardStore.tokenDetails.distributionName);
    let iconUrl = $state(wizardStore.tokenDetails.iconUrl || "");
    let tokenAddress = $state(wizardStore.tokenDetails.tokenAddress || "");
    let totalAmount = $state(wizardStore.tokenDetails.totalAmount);

    // Validation
    const isNameValid = $derived(distributionName.length >= 3);
    const isAddressValid = $derived(
        tokenAddress.startsWith("0x") && tokenAddress.length === 42,
    );
    const isAmountValid = $derived(parseFloat(totalAmount) > 0);
    const canProceed = $derived(isNameValid && isAddressValid && isAmountValid);

    // UX State
    const showNameError = $derived(distributionName.length > 0 && !isNameValid);
    const showAddressError = $derived(
        tokenAddress.length > 0 && !isAddressValid,
    );
    const showAmountError = $derived(totalAmount.length > 0 && !isAmountValid);

    function handleNext() {
        wizardStore.setTokenDetails({
            distributionName,
            iconUrl: iconUrl || null,
            tokenAddress: tokenAddress as `0x${string}`,
            totalAmount,
        });
        wizardStore.nextStep();
        goto("/wizard/step-2");
    }
</script>

<div class="space-y-6">
    <div class="text-center">
        <h2 class="text-2xl font-bold">Token Details</h2>
        <p class="text-base-content/70">
            Define the basics of your token distribution.
        </p>
    </div>

    <!-- Distribution Name -->
    <label class="form-control w-full">
        <div class="label">
            <span class="label-text font-medium">Distribution Name</span>
        </div>
        <input
            type="text"
            placeholder="e.g. ACME Community Drop"
            class="input input-bordered w-full"
            class:input-error={showNameError}
            bind:value={distributionName}
        />
        {#if showNameError}
            <div class="label">
                <span class="label-text-alt text-error"
                    >Name must be at least 3 characters</span
                >
            </div>
        {/if}
    </label>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Icon URL -->
        <label class="form-control w-full">
            <div class="label">
                <span class="label-text font-medium"
                    >Icon URL <span class="text-xs opacity-60">(Optional)</span
                    ></span
                >
            </div>
            <input
                type="url"
                placeholder="https://..."
                class="input input-bordered w-full"
                bind:value={iconUrl}
            />
        </label>

        <!-- Total Amount -->
        <label class="form-control w-full">
            <div class="label">
                <span class="label-text font-medium">Total Amount</span>
            </div>
            <input
                type="number"
                placeholder="0.00"
                class="input input-bordered w-full font-mono"
                class:input-error={showAmountError}
                bind:value={totalAmount}
                min="0"
                step="any"
            />
        </label>
    </div>

    <!-- Token Address -->
    <label class="form-control w-full">
        <div class="label">
            <span class="label-text font-medium">Token Contract Address</span>
        </div>
        <input
            type="text"
            placeholder="0x..."
            class="input input-bordered w-full font-mono"
            class:input-error={showAddressError}
            bind:value={tokenAddress}
        />
        {#if showAddressError}
            <div class="label">
                <span class="label-text-alt text-error"
                    >Invalid Ethereum address format</span
                >
            </div>
        {/if}
    </label>

    <!-- Navigation -->
    <div class="card-actions justify-between mt-8">
        <a href="/" class="btn btn-ghost">Cancel</a>
        <button
            class="btn btn-primary min-w-[120px]"
            disabled={!canProceed}
            onclick={handleNext}
        >
            Next
        </button>
    </div>
</div>
