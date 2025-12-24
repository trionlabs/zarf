<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    onMount(() => {
        wizardStore.goToStep(2);
    });

    let cliffEndDate = $state(wizardStore.schedule.cliffEndDate);
    let durationMonths = $state(
        wizardStore.schedule.distributionDurationMonths,
    );

    // Get min date (today)
    const today = new Date().toISOString().split("T")[0];

    // Validation
    // Validation
    const isDateValid = $derived(cliffEndDate !== "" && cliffEndDate >= today);
    const isDurationValid = $derived(
        durationMonths > 0 && durationMonths <= 48,
    );
    const canProceed = $derived(isDateValid && isDurationValid);

    // UX State
    const showDateInputError = $derived(cliffEndDate !== "" && !isDateValid);
    const showDateMessage = $derived(
        cliffEndDate !== "" && cliffEndDate < today,
    );
    const showSummary = $derived(isDateValid && isDurationValid);

    function handleNext() {
        wizardStore.setSchedule({
            cliffEndDate,
            distributionDurationMonths: durationMonths,
        });
        wizardStore.nextStep();
        goto("/wizard/step-3");
    }

    function handleBack() {
        wizardStore.previousStep();
        goto("/wizard/step-1");
    }
</script>

<div class="space-y-6">
    <div class="text-center">
        <h2 class="text-2xl font-bold">Vesting Schedule</h2>
        <p class="text-base-content/70">
            Configure when tokens become available to claimants.
        </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Cliff End Date -->
        <label class="form-control w-full">
            <div class="label">
                <span class="label-text font-medium">Cliff End Date</span>
            </div>
            <input
                type="date"
                class="input input-bordered w-full"
                class:input-error={showDateInputError}
                bind:value={cliffEndDate}
                min={today}
            />
            {#if showDateMessage}
                <div class="label">
                    <span class="label-text-alt text-error"
                        >Date must be in the future</span
                    >
                </div>
            {/if}
        </label>

        <!-- Distribution Duration -->
        <label class="form-control w-full">
            <div class="label">
                <span class="label-text font-medium">Duration</span>
            </div>
            <select
                class="select select-bordered w-full"
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

    <!-- Minimal Vesting Preview -->
    {#if showSummary}
        <div role="alert" class="alert bg-base-200">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="stroke-current shrink-0 w-6 h-6"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path></svg
            >
            <div>
                <h3 class="font-bold">Summary</h3>
                <div class="text-sm">
                    Cliff ends on <span class="font-bold">{cliffEndDate}</span>.
                    Tokens vest linearly over
                    <span class="font-bold">{durationMonths} months</span>.
                </div>
            </div>
        </div>
    {/if}

    <!-- Navigation -->
    <div class="card-actions justify-between mt-8">
        <button class="btn btn-ghost" onclick={handleBack}>← Back</button>
        <button
            class="btn btn-primary min-w-[120px]"
            disabled={!canProceed}
            onclick={handleNext}
        >
            Next
        </button>
    </div>
</div>
