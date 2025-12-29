<script lang="ts">
    import { onMount } from "svelte";
    import { claimStore } from "$lib/stores/claimStore.svelte";

    let step = $derived(claimStore.step);
    let { children } = $props();

    let isMobile = $state(false);

    onMount(() => {
        const ua = navigator.userAgent.toLowerCase();
        isMobile =
            /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
                ua,
            );
    });
</script>

{#if isMobile}
    <div class="alert alert-warning shadow-lg mb-6">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            /></svg
        >
        <div>
            <h3 class="font-bold">Desktop Recommended</h3>
            <div class="text-xs">
                Generating Zero-Knowledge proofs requires significant memory.
                Mobile devices may crash.
            </div>
        </div>
    </div>
{/if}

<div class="steps steps-horizontal w-full mb-8">
    <div class="step" class:step-primary={step >= 1}>Upload</div>
    <div class="step" class:step-primary={step >= 2}>Proof</div>
    <div class="step" class:step-primary={step >= 3}>Review</div>
</div>

<div class="mt-4">
    {@render children()}
</div>
