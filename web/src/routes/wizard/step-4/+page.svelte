<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    onMount(() => {
        wizardStore.goToStep(4);
    });

    // Placeholder for future compliance rules
    let acceptedTerms = $state(false);
    let generateProof = $state(true); // Default true

    const canProceed = $derived(acceptedTerms);

    function handleNext() {
        wizardStore.nextStep();
        goto("/wizard/step-5");
    }

    function handleBack() {
        wizardStore.previousStep();
        goto("/wizard/step-3");
    }
</script>

<div class="space-y-6">
    <div class="text-center">
        <h2 class="text-2xl font-bold">Compliance & Rules</h2>
        <p class="text-base-content/70">
            Review and accept the distribution rules.
        </p>
    </div>

    <!-- Info Box -->
    <div role="alert" class="alert alert-info">
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
        <span>
            <strong>Immutable Deployment:</strong> Once deployed, vesting schedules
            and recipient lists cannot be modified. Verify your data carefully.
        </span>
    </div>

    <div
        class="form-control bg-base-100 rounded-box border border-base-200 p-4"
    >
        <label class="label cursor-pointer justify-start gap-4 items-start">
            <input
                type="checkbox"
                class="checkbox checkbox-primary mt-1"
                bind:checked={acceptedTerms}
            />
            <span class="label-text">
                <span class="font-bold text-lg block mb-1"
                    >Accept Terms & Conditions</span
                >
                <span class="text-sm opacity-70 block">
                    I confirm that I have verified the whitelist data and
                    understand that the smart contract deployment is
                    irreversible. I accept full responsibility.
                </span>
            </span>
        </label>
    </div>

    <div
        class="form-control bg-base-200/50 rounded-box border border-base-200 p-4 opacity-70"
    >
        <label class="label cursor-pointer justify-start gap-4 items-center">
            <input
                type="checkbox"
                checked={generateProof}
                disabled
                class="checkbox checkbox-sm"
            />
            <span class="label-text flex-1">
                <span class="font-bold">Generate Merkle Tree</span>
                <span class="text-xs opacity-70 block">
                    Automatically generates cryptographic proofs (Required).
                </span>
            </span>
            <span class="badge badge-sm badge-ghost">AUTO</span>
        </label>
    </div>

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
