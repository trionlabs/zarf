<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import {
        Tag,
        Image,
        Hash,
        Coins,
        Calendar,
        Clock,
        ArrowRight,
    } from "lucide-svelte";
    import { fly } from "svelte/transition";

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
    function handleNext() {
        wizardStore.setTokenDetails({
            distributionName,
            iconUrl: iconUrl || null,
            tokenAddress: tokenAddress as `0x${string}`,
            totalAmount,
        });

        wizardStore.setSchedule({
            cliffEndDate,
            distributionDurationMonths: durationMonths,
        });

        wizardStore.goToStep(2);
        goto("/wizard/step-2");
    }
</script>

<div class="h-full flex flex-col justify-center max-w-5xl mx-auto py-8">
    <!-- Ultra Minimal Header -->
    <div class="mb-16 md:mb-20">
        <h2 class="text-4xl font-light tracking-tight text-base-content mb-3">
            Configuration
        </h2>
        <p class="text-lg text-base-content/50 font-light tracking-wide">
            Define basic parameters for your distribution event.
        </p>
    </div>

    <div class="space-y-16">
        <!-- Input Group 1: Identity -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            <!-- Name -->
            <div class="form-control w-full">
                <div class="label pt-0 px-1 pb-3">
                    <span
                        class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                        >Token Name</span
                    >
                </div>
                <!-- Interactive Input Container -->
                <label
                    class="input h-14 flex items-center gap-4 bg-base-100/30 border-[0.5px] border-base-content/10 hover:border-base-content/20 focus-within:bg-base-100 focus-within:border-primary/50 focus-within:shadow-[0_0_30px_-10px_rgba(0,0,0,0.05)] focus-within:shadow-primary/5 transition-all duration-300 rounded-xl px-4"
                    class:input-error={showNameError}
                >
                    <Tag class="w-5 h-5 opacity-30 shrink-0" />
                    <input
                        type="text"
                        class="grow placeholder:opacity-40 text-base"
                        placeholder="e.g. ACME Token"
                        bind:value={distributionName}
                    />
                </label>
                {#if showNameError}
                    <div class="label py-1 px-1" transition:fly={{ y: -10 }}>
                        <span class="label-text-alt text-error text-xs"
                            >Name too short</span
                        >
                    </div>
                {/if}
            </div>

            <!-- Amount -->
            <div class="form-control w-full">
                <div class="label pt-0 px-1 pb-3">
                    <span
                        class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                        >Total Supply</span
                    >
                </div>
                <label
                    class="input h-14 flex items-center gap-4 bg-base-100/30 border-[0.5px] border-base-content/10 hover:border-base-content/20 focus-within:bg-base-100 focus-within:border-primary/50 focus-within:shadow-[0_0_30px_-10px_rgba(0,0,0,0.05)] focus-within:shadow-primary/5 transition-all duration-300 rounded-xl px-4"
                    class:input-error={showAmountError}
                >
                    <Coins class="w-5 h-5 opacity-30 shrink-0" />
                    <input
                        type="number"
                        class="grow placeholder:opacity-40 text-base font-mono"
                        placeholder="1,000,000"
                        bind:value={totalAmount}
                        min="0"
                        step="any"
                    />
                </label>
            </div>

            <!-- Contract Address - Spans full width -->
            <div class="form-control w-full md:col-span-2">
                <div class="label pt-0 px-1 pb-3">
                    <span
                        class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                        >Contract Address</span
                    >
                </div>
                <label
                    class="input h-14 flex items-center gap-4 bg-base-100/30 border-[0.5px] border-base-content/10 hover:border-base-content/20 focus-within:bg-base-100 focus-within:border-primary/50 focus-within:shadow-[0_0_30px_-10px_rgba(0,0,0,0.05)] focus-within:shadow-primary/5 transition-all duration-300 rounded-xl px-4"
                    class:input-error={showAddressError}
                >
                    <Hash class="w-5 h-5 opacity-30 shrink-0" />
                    <input
                        type="text"
                        class="grow placeholder:opacity-40 text-base font-mono tracking-tight"
                        placeholder="0x..."
                        bind:value={tokenAddress}
                    />
                </label>
                {#if showAddressError}
                    <div class="label py-1 px-1" transition:fly={{ y: -10 }}>
                        <span class="label-text-alt text-error text-xs"
                            >Invalid Ethereum address</span
                        >
                    </div>
                {/if}
            </div>
            <!-- Icon URL - Spans full width for breathing room -->
            <div class="form-control w-full md:col-span-2 relative group">
                <div class="label pt-0 px-1 pb-3">
                    <span
                        class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                        >Icon URL <span
                            class="normal-case opacity-50 tracking-normal ml-1"
                            >(Optional)</span
                        ></span
                    >
                </div>
                <label
                    class="input h-14 flex items-center gap-4 bg-base-100/30 border-[0.5px] border-base-content/10 hover:border-base-content/20 focus-within:bg-base-100 focus-within:border-primary/50 focus-within:shadow-[0_0_30px_-10px_rgba(0,0,0,0.05)] focus-within:shadow-primary/5 transition-all duration-300 rounded-xl px-4"
                >
                    <Image class="w-5 h-5 opacity-30 shrink-0" />
                    <input
                        type="url"
                        class="grow placeholder:opacity-40 text-base"
                        placeholder="https://..."
                        bind:value={iconUrl}
                    />
                </label>
            </div>
        </div>

        <!-- Section 2: Vesting -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            <!-- Cliff Date -->
            <div class="form-control w-full">
                <div class="label pt-0 px-1 pb-3">
                    <span
                        class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                        >Cliff Date</span
                    >
                </div>
                <label
                    class="input h-14 flex items-center gap-4 bg-base-100/30 border-[0.5px] border-base-content/10 hover:border-base-content/20 focus-within:bg-base-100 focus-within:border-primary/50 focus-within:shadow-[0_0_30px_-10px_rgba(0,0,0,0.05)] focus-within:shadow-primary/5 transition-all duration-300 rounded-xl px-4"
                    class:input-error={showDateInputError}
                >
                    <Calendar class="w-5 h-5 opacity-30 shrink-0" />
                    <input
                        type="date"
                        class="grow placeholder:opacity-40 text-base bg-transparent p-0"
                        min={today}
                        bind:value={cliffEndDate}
                    />
                </label>
                {#if showDateMessage}
                    <div class="label py-1 px-1" transition:fly={{ y: -10 }}>
                        <span class="label-text-alt text-error text-xs"
                            >Must be future date</span
                        >
                    </div>
                {/if}
            </div>

            <!-- Duration -->
            <div class="form-control w-full">
                <div class="label pt-0 px-1 pb-3">
                    <span
                        class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                        >Vesting Duration</span
                    >
                </div>
                <label
                    class="input h-14 flex items-center gap-4 bg-base-100/30 border-[0.5px] border-base-content/10 hover:border-base-content/20 focus-within:bg-base-100 focus-within:border-primary/50 focus-within:shadow-[0_0_30px_-10px_rgba(0,0,0,0.05)] focus-within:shadow-primary/5 transition-all duration-300 rounded-xl px-4"
                >
                    <Clock class="w-5 h-5 opacity-30 shrink-0" />
                    <select
                        class="select select-ghost select-sm w-full focus:outline-none focus:border-none focus:bg-transparent h-full text-base font-normal px-0"
                        bind:value={durationMonths}
                    >
                        <option value={0} disabled>Select duration</option>
                        <option value={1}>1 month (Immediate)</option>
                        <option value={3}>3 months</option>
                        <option value={6}>6 months</option>
                        <option value={12}>12 months (1 year)</option>
                        <option value={24}>24 months (2 years)</option>
                        <option value={36}>36 months (3 years)</option>
                        <option value={48}>48 months (4 years)</option>
                    </select>
                </label>
            </div>
        </div>
    </div>

    <!-- Navigation -->
    <div class="flex justify-end pt-20">
        <button
            class="btn btn-primary h-14 px-10 rounded-full shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 text-lg font-medium tracking-wide group"
            disabled={!canProceed}
            onclick={handleNext}
        >
            Next Step
            <ArrowRight
                class="w-5 h-5 transition-transform group-hover:translate-x-1 ml-1"
            />
        </button>
    </div>
</div>
