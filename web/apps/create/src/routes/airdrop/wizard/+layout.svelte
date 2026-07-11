<script lang="ts">
    import WizardSteps from '$lib/components/wizard/WizardSteps.svelte';

    let { children } = $props();

    const steps = [
        { label: 'Token', path: '/airdrop/wizard/step-0' },
        { label: 'Recipients', path: '/airdrop/wizard/step-1' },
        { label: 'Distribute', path: '/airdrop/wizard/step-2' },
    ];
</script>

<div class="min-h-screen bg-zen-bg">
    <WizardSteps {steps} />
    <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {@render children()}
    </div>
</div>
