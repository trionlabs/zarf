<script lang="ts">
    import { claimFlowStore } from "$lib/stores/claimFlowStore.svelte";
    import type { ClaimStep } from "$lib/stores/types";
    import { CheckCircle2, Circle, Disc } from "lucide-svelte";
    import { fly } from "svelte/transition";

    const steps: { label: string; step: ClaimStep }[] = [
        { label: "Identify", step: 1 },
        { label: "Timeline", step: 2 },
        { label: "Wallet", step: 3 },
        { label: "Proof", step: 4 },
        { label: "Submit", step: 5 },
    ];

    let currentStep = $derived(claimFlowStore.currentStep);
</script>

<div class="space-y-0.5 py-2 pl-4" in:fly={{ y: -10, duration: 200 }}>
    {#each steps as step, i}
        {@const isActive = step.step === currentStep}
        {@const isPast = step.step < currentStep}

        <!-- Container: Use <div> since we might not want direct navigation in claim flow unless strictly allowed -->
        <!-- For now, making it clickable if past steps to allow going back, or using store methods -->

        <button
            class="relative flex items-center gap-3 px-3 py-2 text-xs transition-colors duration-200 w-full text-left
            {isActive
                ? 'text-primary font-medium'
                : isPast
                  ? 'text-base-content/60 hover:text-base-content hover:bg-base-content/5 cursor-pointer'
                  : 'text-base-content/30 cursor-not-allowed'}"
            onclick={() => isPast && claimFlowStore.goToStep(step.step)}
            disabled={!isPast && !isActive}
        >
            {@render StepContent({ i, steps, isActive, isPast, step })}
        </button>
    {/each}
</div>

{#snippet StepContent({ i, steps, isActive, isPast, step }: any)}
    <!-- Connector Line -->
    {#if i < steps.length - 1}
        <div
            class="absolute left-[19px] top-7 w-px h-3 bg-base-content/10"
        ></div>
    {/if}

    <!-- Icon -->
    {#if isPast}
        <CheckCircle2 class="w-3.5 h-3.5 text-primary" />
    {:else if isActive}
        <Disc class="w-3.5 h-3.5 animate-pulse" />
    {:else}
        <Circle class="w-3.5 h-3.5" />
    {/if}

    <span>{step.label}</span>
{/snippet}
