<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { Check, Copy, ArrowRight } from "lucide-svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import { fly } from "svelte/transition";

    let contractAddress = $state("");
    let copied = $state(false);

    onMount(() => {
        // Nothing in src/ programmatically navigates here — deploy
        // completion routes to /distributions. A direct visit with an
        // empty deployStore would render the "Not available" fallback,
        // which is broken UX for a "deployment complete" landing. Redirect
        // out instead of rendering a half-state.
        if (!deployStore.contractAddress) {
            goto("/distributions");
            return;
        }
        // Index 3 = terminal "done" state (wizardStore bounds 0..3). The
        // pre-rename code set goToStep(2) which incorrectly tagged a
        // post-launch view with the deploy step's index — the exact bug
        // Phase 5 was scoped to fix.
        wizardStore.goToStep(3);
        // Source of truth for the contract address is deployStore; wizardStore
        // no longer mirrors deployment results.
        contractAddress = deployStore.contractAddress ?? "";
    });

    function copyToClipboard() {
        if (!contractAddress) return;
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
    class="h-full flex flex-col justify-center items-center max-w-3xl mx-auto py-12 text-center"
>
    <div
        class="w-20 h-20 bg-zen-success/10 text-zen-success rounded-full flex items-center justify-center mb-6"
        in:fly={{ y: 20, duration: 600 }}
    >
        <Check class="w-10 h-10" />
    </div>

    <h2
        class="text-3xl font-light tracking-tight text-zen-fg mb-2"
        in:fly={{ y: 20, duration: 600, delay: 100 }}
    >
        Deployment Complete
    </h2>
    <p
        class="text-base text-zen-fg/50 font-light tracking-wide mb-8"
        in:fly={{ y: 20, duration: 600, delay: 200 }}
    >
        Your vesting contract is live. Recipients can claim from the dashboard.
    </p>

    <!-- Contract Address Box -->
    <div
        class="w-full bg-zen-bg/40 border border-zen-border rounded-2xl p-6 mb-8 relative group overflow-hidden"
        in:fly={{ y: 20, duration: 600, delay: 300 }}
    >
        <div class="flex flex-col gap-2">
            <span
                class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                >Contract Address</span
            >
            <div class="flex items-center justify-center gap-3">
                <span class="font-mono text-lg">
                    {contractAddress || "Not available"}
                </span>
                <button
                    class="p-2 rounded-full hover:bg-zen-fg/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!contractAddress}
                    aria-label="Copy contract address"
                    onclick={copyToClipboard}
                >
                    {#if copied}
                        <Check class="w-4 h-4 text-zen-success" />
                    {:else}
                        <Copy class="w-4 h-4 opacity-50" />
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-4" in:fly={{ y: 20, duration: 600, delay: 500 }}>
        <ZenButton
            variant="primary"
            size="lg"
            class="px-10 h-12 text-base"
            onclick={handleFinish}
        >
            All Done
            <ArrowRight class="w-4 h-4 ml-2" />
        </ZenButton>
    </div>
</div>
