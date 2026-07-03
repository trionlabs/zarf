<script lang="ts">
    import WizardSteps from '$lib/components/wizard/WizardSteps.svelte';
    let { children } = $props();
</script>

<div>
    <!-- Minimal Progress Bar -->
    <WizardSteps />

    <!-- Step Content -->
    <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {@render children()}
    </div>
</div>
