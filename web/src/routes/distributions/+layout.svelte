<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { onMount } from "svelte";
    import AppShell from "$lib/components/layout/AppShell.svelte";

    let { children } = $props();

    onMount(() => {
        wizardStore.restore();
    });
</script>

<AppShell>
    {@render children()}
</AppShell>
