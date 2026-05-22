<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { wizardStore } from "../../stores/wizardStore.svelte";

    const steps = [
        { label: "Token", path: "/wizard/step-0" },
        { label: "Create", path: "/wizard/step-1" },
        { label: "Deploy", path: "/wizard/deploy" },
    ];

    let mounted = $state(false);
    let currentStepIndex = $state(0);

    // Check if we're on deploy page
    const isDeployPage = $derived($page.url.pathname.includes('/deploy'));

    // Determine effective step index based on URL
    const effectiveStepIndex = $derived.by(() => {
        const path = $page.url.pathname;
        if (path.includes('/step-0')) return 0;
        if (path.includes('/step-1')) return 1;
        if (path.includes('/deploy') || path.includes('/step-3')) return 2;
        return currentStepIndex;
    });

    onMount(() => {
        mounted = true;
        currentStepIndex = wizardStore.currentStep;
    });

    $effect(() => {
        if (mounted) {
            currentStepIndex = wizardStore.currentStep;
        }
    });

    // Progress percentage
    const progressPercent = $derived(((effectiveStepIndex + 1) / steps.length) * 100);
    const currentStepLabel = $derived(steps[effectiveStepIndex]?.label || "");
</script>

<!-- Minimal Progress Bar -->
<div class="w-full border-b border-zen-border-subtle bg-zen-bg">
    <div class="max-w-7xl mx-auto px-6 py-2 flex items-center gap-4">
        <!-- Progress Bar -->
        <div class="flex-1 h-1 bg-zen-fg/10 rounded-full overflow-hidden">
            <div
                class="h-full bg-zen-fg rounded-full transition-all duration-500 ease-out"
                style="width: {progressPercent}%"
            ></div>
        </div>

        <!-- Step Label -->
        <div class="text-xs font-mono text-zen-fg-muted whitespace-nowrap">
            Step {effectiveStepIndex + 1} of {steps.length} · <span class="text-zen-fg font-medium uppercase tracking-wider">{currentStepLabel}</span>
        </div>
    </div>
</div>
