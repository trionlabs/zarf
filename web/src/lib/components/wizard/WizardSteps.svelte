<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { CheckCircle2, Circle, Disc } from "lucide-svelte";
    import { fly } from "svelte/transition";

    const steps = [
        { label: "Token", path: "/wizard/step-0" },
        { label: "Create", path: "/wizard/step-1" },
        { label: "Complete", path: "/wizard/step-3" },
    ];

    let currentStepIndex = $derived(wizardStore.currentStep);
</script>

<div class="space-y-0.5 py-2 pl-4" in:fly={{ y: -10, duration: 200 }}>
    {#each steps as step, i}
        {@const isActive = i === currentStepIndex}
        {@const isPast = i < currentStepIndex}

        <!-- Container: Use <a> for past steps, <div> for others -->
        {#if isPast}
            <a
                href={step.path}
                class="relative flex items-center gap-3 px-3 py-2 text-xs transition-colors duration-200 text-base-content/60 hover:text-base-content hover:bg-base-content/5 rounded-lg"
                onclick={() => wizardStore.goToStep(i)}
            >
                {@render StepContent({ i, steps, isActive, isPast, step })}
            </a>
        {:else}
            <div
                class="relative flex items-center gap-3 px-3 py-2 text-xs transition-colors duration-200
                {isActive
                    ? 'text-primary font-medium'
                    : 'text-base-content/30 cursor-not-allowed'}"
            >
                {@render StepContent({ i, steps, isActive, isPast, step })}
            </div>
        {/if}
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
