<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { Check, Copy, ExternalLink, ArrowRight } from "lucide-svelte";
    import { fly } from "svelte/transition";

    onMount(() => {
        wizardStore.goToStep(2);
    });

    // Mock contract address for demo
    let contractAddress =
        wizardStore.deployedContractAddress ||
        "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
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

<div
    class="h-full flex flex-col justify-center items-center max-w-2xl mx-auto py-12 text-center"
>
    <div
        class="w-24 h-24 bg-success/10 text-success rounded-full flex items-center justify-center mb-8"
        in:fly={{ y: 20, duration: 600 }}
    >
        <Check class="w-12 h-12" />
    </div>

    <h2
        class="text-4xl font-light tracking-tight text-base-content mb-4"
        in:fly={{ y: 20, duration: 600, delay: 100 }}
    >
        Deployment Complete
    </h2>
    <p
        class="text-lg text-base-content/50 font-light tracking-wide mb-12"
        in:fly={{ y: 20, duration: 600, delay: 200 }}
    >
        Your vesting contract is live and ready for distribution.
    </p>

    <!-- Contract Address Box -->
    <div
        class="w-full bg-base-100/40 border border-base-content/10 rounded-2xl p-6 mb-12 relative group overflow-hidden"
        in:fly={{ y: 20, duration: 600, delay: 300 }}
    >
        <div
            class="absolute inset-0 bg-gradient-to-r from-transparent via-base-content/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
        ></div>

        <div class="flex flex-col gap-2">
            <span
                class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                >Contract Address</span
            >
            <div class="flex items-center justify-center gap-3">
                <span class="font-mono text-lg">{contractAddress}</span>
                <button
                    class="btn btn-circle btn-ghost btn-sm"
                    onclick={copyToClipboard}
                >
                    {#if copied}
                        <Check class="w-4 h-4 text-success" />
                    {:else}
                        <Copy class="w-4 h-4 opacity-50" />
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-4" in:fly={{ y: 20, duration: 600, delay: 400 }}>
        <a href="/dashboard" class="btn btn-outline h-12 px-8 rounded-full">
            View Dashboard
            <ExternalLink class="w-4 h-4 ml-2 opacity-60" />
        </a>
        <button
            class="btn btn-primary h-12 px-10 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 text-base font-medium tracking-wide"
            onclick={handleFinish}
        >
            Done
            <ArrowRight class="w-4 h-4 ml-2" />
        </button>
    </div>
</div>
