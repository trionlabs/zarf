<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";

    // Redirect to step 0 (Token Entry) when visiting /wizard
    onMount(() => {
        goto("/distributions", { replaceState: true });
    });
</script>

<div class="flex items-center justify-center min-h-32">
    <div class="w-8 h-8 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"></div>
    <span class="ml-4">Loading wizard...</span>
</div>
