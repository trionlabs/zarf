<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    onMount(() => {
        wizardStore.goToStep(6);
    });

    // Mock contract address for demo
    let contractAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    let copied = $state(false);

    function copyToClipboard() {
        navigator.clipboard.writeText(contractAddress);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    function handleFinish() {
        wizardStore.reset();
        goto("/");
    }
</script>

<div class="space-y-8 text-center">
    <div>
        <div
            class="inline-flex items-center justify-center p-4 bg-success/10 text-success rounded-full mb-4"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-16 w-16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                /></svg
            >
        </div>
        <h2 class="text-3xl font-bold">Deployment Complete!</h2>
        <p class="text-base-content/70 mt-2">
            Your vesting contract is live on the network.
        </p>
    </div>

    <div class="form-control w-full max-w-md mx-auto">
        <label class="label">
            <span class="label-text">Contract Address</span>
        </label>
        <div class="join">
            <input
                class="input input-bordered join-item w-full font-mono text-sm"
                value={contractAddress}
                readonly
            />
            <button class="btn join-item" onclick={copyToClipboard}>
                {#if copied}
                    Copied!
                {:else}
                    Copy
                {/if}
            </button>
        </div>
    </div>

    <div class="card-actions justify-center gap-4 mt-8">
        <a href="/dashboard" class="btn btn-outline">View Dashboard</a>
        <button class="btn btn-primary min-w-[120px]" onclick={handleFinish}>
            Done
        </button>
    </div>
</div>
