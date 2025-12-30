<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { CheckCircle2, Circle, Disc } from "lucide-svelte";
    import { fly } from "svelte/transition";

    const steps: { label: string; value: 1 | 2 | 3 }[] = [
        { label: "Credentials", value: 1 },
        { label: "Generate Proof", value: 2 },
        { label: "Review & Claim", value: 3 },
    ];

    let currentStep = $derived(claimStore.step);
</script>

<div class="space-y-0.5 py-2 pl-4" in:fly={{ y: -10, duration: 200 }}>
    {#each steps as step, i}
        {@const isActive = step.value === currentStep}
        {@const isPast = step.value < currentStep}

        <!-- Container: Clickable only if past (to go back) or current -->
        <button
            class="relative flex items-center gap-3 px-3 py-2 text-xs w-full text-left transition-colors duration-200 rounded-lg
            {isActive
                ? 'text-primary font-medium bg-primary/5'
                : isPast
                  ? 'text-base-content/60 hover:text-base-content hover:bg-base-content/5 cursor-pointer'
                  : 'text-base-content/30 cursor-not-allowed'}"
            onclick={() => isPast && claimStore.goToStep(step.value)}
            disabled={!isPast && !isActive}
        >
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
                <Disc class="w-3.5 h-3.5 animate-pulse text-primary" />
            {:else}
                <Circle class="w-3.5 h-3.5" />
            {/if}

            <span>{step.label}</span>
        </button>
    {/each}
</div>
