<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";

    // Redirect to step 0 (Token Entry) when visiting /wizard
    onMount(() => {
        goto("/wizard/step-0", { replaceState: true });
    });
</script>

<div class="flex items-center justify-center min-h-32">
    <span class="loading loading-spinner loading-lg"></span>
    <span class="ml-4">Loading wizard...</span>
</div>
