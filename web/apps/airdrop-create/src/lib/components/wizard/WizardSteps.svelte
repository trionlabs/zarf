<script lang="ts">
    import { page } from '$app/state';

    const steps = [
        { label: 'Token', path: '/wizard/step-0' },
        { label: 'Recipients', path: '/wizard/step-1' },
        { label: 'Distribute', path: '/wizard/step-2' },
    ];

    // The "done" view is a post-launch terminal state, intentionally outside the
    // 3-step progress bar; the bar self-hides while it is shown.
    const isDonePage = $derived(page.url.pathname.includes('/wizard/done'));

    const effectiveStepIndex = $derived.by(() => {
        const path = page.url.pathname;
        if (path.includes('/step-0')) return 0;
        if (path.includes('/step-1')) return 1;
        if (path.includes('/step-2')) return 2;
        return 0;
    });

    const progressPercent = $derived(((effectiveStepIndex + 1) / steps.length) * 100);
    const currentStepLabel = $derived(steps[effectiveStepIndex]?.label ?? '');
</script>

{#if !isDonePage}
    <div class="w-full border-b border-zen-border-subtle bg-zen-bg">
        <div class="max-w-7xl mx-auto px-6 py-2 flex items-center gap-4">
            <div
                class="flex-1 h-1 bg-zen-fg/10 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuenow={effectiveStepIndex + 1}
                aria-valuetext={`Step ${effectiveStepIndex + 1} of ${steps.length}: ${currentStepLabel}`}
            >
                <div
                    class="h-full bg-zen-fg rounded-full transition-all duration-500 ease-out"
                    style="width: {progressPercent}%"
                ></div>
            </div>

            <div class="text-xs font-mono text-zen-fg-muted whitespace-nowrap">
                Step {effectiveStepIndex + 1} of {steps.length} ·
                <span class="text-zen-fg font-medium uppercase tracking-wider"
                    >{currentStepLabel}</span
                >
            </div>
        </div>
    </div>
{/if}
