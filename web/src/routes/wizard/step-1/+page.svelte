<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { ArrowRight } from "lucide-svelte";

    onMount(() => {
        wizardStore.goToStep(1);
    });

    // --- Token Details State ---
    let distributionName = $state(wizardStore.tokenDetails.distributionName);
    let iconUrl = $state(wizardStore.tokenDetails.iconUrl || "");
    let tokenAddress = $state(wizardStore.tokenDetails.tokenAddress || "");
    let totalAmount = $state(wizardStore.tokenDetails.totalAmount);

    // --- Vesting Schedule State ---
    let cliffEndDate = $state(wizardStore.schedule.cliffEndDate);
    let durationMonths = $state(
        wizardStore.schedule.distributionDurationMonths || 0,
    );

    // Get min date (today)
    const today = new Date().toISOString().split("T")[0];

    // --- Validation ---
    const isNameValid = $derived(distributionName.length >= 3);
    const isAddressValid = $derived(
        tokenAddress.startsWith("0x") && tokenAddress.length === 42,
    );
    const isAmountValid = $derived(parseFloat(totalAmount) > 0);
    const isDateValid = $derived(cliffEndDate !== "" && cliffEndDate >= today);
    const isDurationValid = $derived(
        durationMonths > 0 && durationMonths <= 48,
    );

    const canProceed = $derived(
        isNameValid &&
            isAddressValid &&
            isAmountValid &&
            isDateValid &&
            isDurationValid,
    );

    // --- UX State (Errors) ---
    const showNameError = $derived(distributionName.length > 0 && !isNameValid);
    const showAddressError = $derived(
        tokenAddress.length > 0 && !isAddressValid,
    );
    const showAmountError = $derived(totalAmount.length > 0 && !isAmountValid);
    const showDateInputError = $derived(cliffEndDate !== "" && !isDateValid);
    const showDateMessage = $derived(
        cliffEndDate !== "" && cliffEndDate < today,
    );

    // --- Handlers ---
    $effect(() => {
        wizardStore.setTokenDetails({
            distributionName,
            iconUrl: iconUrl || null,
            tokenAddress: tokenAddress ? (tokenAddress as `0x${string}`) : null,
            totalAmount,
        });
        wizardStore.setSchedule({
            cliffEndDate,
            distributionDurationMonths: durationMonths,
        });
    });

    function handleNext() {
        wizardStore.goToStep(2);
        goto("/wizard/step-2");
    }
</script>

<article class="h-full flex flex-col">
    <!-- Page Header -->
    <header class="mb-8">
        <h1 class="text-2xl font-semibold">Configuration</h1>
        <p class="text-sm text-base-content/60 mt-1">
            Define the core parameters for your token distribution.
        </p>
    </header>

    <section class="space-y-8 flex-1">
        <!-- Token Identity Section -->
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Token Identity</legend>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Name -->
                <div class="form-control w-full">
                    <label class="label">
                        <span class="label-text">Token Name</span>
                    </label>
                    <input
                        type="text"
                        placeholder="Enter token name"
                        class="input input-bordered w-full"
                        class:input-error={showNameError}
                        bind:value={distributionName}
                    />
                    {#if showNameError}
                        <label class="label">
                            <span class="label-text-alt text-error"
                                >Name too short</span
                            >
                        </label>
                    {/if}
                </div>

                <!-- Amount -->
                <div class="form-control w-full">
                    <label class="label">
                        <span class="label-text">Total Supply</span>
                    </label>
                    <input
                        type="number"
                        placeholder="0"
                        class="input input-bordered w-full font-mono"
                        bind:value={totalAmount}
                        min="0"
                        step="any"
                    />
                </div>
            </div>

            <!-- Contract Address -->
            <div class="form-control w-full mt-4">
                <label class="label">
                    <span class="label-text">Contract Address</span>
                </label>
                <input
                    type="text"
                    placeholder="0x..."
                    class="input input-bordered w-full font-mono"
                    class:input-error={showAddressError}
                    bind:value={tokenAddress}
                />
                {#if showAddressError}
                    <label class="label">
                        <span class="label-text-alt text-error"
                            >Invalid Ethereum address</span
                        >
                    </label>
                {/if}
            </div>

            <!-- Icon URL -->
            <div class="form-control w-full mt-4">
                <label class="label">
                    <span class="label-text">Icon URL</span>
                    <span class="label-text-alt">Optional</span>
                </label>
                <input
                    type="url"
                    placeholder="https://example.com/icon.png"
                    class="input input-bordered w-full"
                    bind:value={iconUrl}
                />
            </div>
        </fieldset>

        <!-- Vesting Schedule Section -->
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Vesting Schedule</legend>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Cliff Date -->
                <div class="form-control w-full">
                    <label class="label">
                        <span class="label-text">Cliff Date</span>
                    </label>
                    <input
                        type="date"
                        class="input input-bordered w-full"
                        class:input-error={showDateInputError}
                        min={today}
                        bind:value={cliffEndDate}
                    />
                    {#if showDateMessage}
                        <label class="label">
                            <span class="label-text-alt text-error"
                                >Must be future date</span
                            >
                        </label>
                    {/if}
                </div>

                <!-- Duration -->
                <div class="form-control w-full">
                    <label class="label">
                        <span class="label-text">Vesting Duration</span>
                    </label>
                    <select
                        class="select select-bordered w-full"
                        bind:value={durationMonths}
                    >
                        <option value={0} disabled>Select duration</option>
                        <option value={1}>1 month</option>
                        <option value={3}>3 months</option>
                        <option value={6}>6 months</option>
                        <option value={12}>12 months (1 year)</option>
                        <option value={24}>24 months (2 years)</option>
                        <option value={36}>36 months (3 years)</option>
                        <option value={48}>48 months (4 years)</option>
                    </select>
                </div>
            </div>
        </fieldset>
    </section>

    <!-- Navigation Footer -->
    <footer
        class="flex items-center justify-between pt-8 mt-auto border-t border-base-200"
    >
        <div class="text-sm text-base-content/50 hidden md:block">
            Step 1 of 4
        </div>
        <button
            type="button"
            class="btn btn-primary"
            disabled={!canProceed}
            onclick={handleNext}
        >
            Continue
            <ArrowRight class="w-4 h-4 ml-1" />
        </button>
    </footer>
</article>
