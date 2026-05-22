<script lang="ts">
    import WizardSteps from "$lib/components/wizard/WizardSteps.svelte";
    let { children } = $props();
</script>

<div class="min-h-screen bg-zen-bg">
    <!-- Minimal Progress Bar -->
    <WizardSteps />

    <!-- Step Content -->
    <div class="w-full max-w-7xl mx-auto px-6 py-4">
        {@render children()}
    </div>
</div>
