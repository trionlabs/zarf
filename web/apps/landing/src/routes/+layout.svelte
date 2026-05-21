<script lang="ts">
    import "../app.css";
    import { onMount } from "svelte";
    import { themeStore } from "@zarf/ui/stores/themeStore.svelte";

    // Initialize theme on mount (sets data-theme attribute)
    onMount(() => {
        themeStore.restore();
    });
</script>

<a href="#main" class="skip-link">Skip to content</a>

<!-- Grain overlay is handled in +page.svelte with custom settings -->
<main id="main" tabindex="-1">
    <slot />
</main>
