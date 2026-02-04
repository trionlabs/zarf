<script lang="ts">
    import "../app.css";
    import { onMount } from "svelte";
    import { themeStore } from "@zarf/ui/stores/themeStore.svelte";

    // Initialize theme on mount (sets data-theme attribute)
    onMount(() => {
        themeStore.restore();
    });
</script>

<!-- Grain overlay is handled in +page.svelte with custom settings -->
<slot />
