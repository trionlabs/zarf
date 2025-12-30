<script lang="ts">
    /**
     * PASS-THROUGH LAYOUT
     *
     * This layout is nested inside `routes/claim/+layout.svelte`.
     * The parent provide the AppShell (Navbar + Sidebar).
     * This file exists only to handle nested route rendering or wizard-specific logic if needed.
     */
    let { children } = $props();
</script>

{@render children()}
