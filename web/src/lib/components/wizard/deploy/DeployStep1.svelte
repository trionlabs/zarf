<script lang="ts">
    import { onMount } from "svelte";
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { processWhitelist } from "$lib/services/merkleTree";
    import { fly } from "svelte/transition";

    // Direct state access from Runes Class
    let distribution = $derived(deployStore.distribution);
    let isGeneratingMerkle = $derived(deployStore.isGeneratingMerkle);
    let merkleResult = $derived(deployStore.merkleResult);
    let merkleError = $derived(deployStore.merkleError);

    async function generateTree() {
        if (!distribution) return;

        deployStore.startMerkleGeneration();

        try {
            // Map recipients to { email, amount } format expected by service
            const entries = distribution.recipients.map((r: any) => ({
                email: r.email || "",
                amount: Number(r.amount),
            }));

            const result = await processWhitelist(entries);
            deployStore.setMerkleResult(result);
        } catch (e: any) {
            console.error("Merkle generation error:", e);
            deployStore.setMerkleError(
                e.message || "Failed to generate Merkle Tree",
            );
        }
    }

    onMount(() => {
        // If we already have a result, don't regenerate
        if (merkleResult) return;

        // If data is ready, start
        if (distribution && !isGeneratingMerkle) {
            generateTree();
        }
    });

    function retry() {
        generateTree();
    }
</script>

<div class="p-8">
    <div class="mb-6">
        <h2 class="text-2xl font-bold mb-2">Preparing Distribution</h2>
        <p class="text-base-content/70">
            We are generating the cryptographic proofs required for your
            recipients to claim their tokens.
        </p>
    </div>

    {#if distribution}
        <!-- Summary Card -->
        <div class="bg-base-200/50 rounded-lg p-4 mb-8 border border-base-300">
            <h3
                class="font-bold text-sm uppercase tracking-wider opacity-50 mb-3"
            >
                Distribution Summary
            </h3>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <span class="text-xs opacity-50 block">Token Amount</span>
                    <span class="font-mono font-bold text-lg"
                        >{Number(distribution.amount).toLocaleString()}</span
                    >
                </div>
                <div>
                    <span class="text-xs opacity-50 block">Recipients</span>
                    <span class="font-mono font-bold text-lg"
                        >{distribution.recipients.length}</span
                    >
                </div>
                <div>
                    <span class="text-xs opacity-50 block"
                        >Vesting Duration</span
                    >
                    <span class="font-mono font-bold"
                        >{distribution.schedule?.distributionDuration}
                        {distribution.schedule?.durationUnit}</span
                    >
                </div>
                <div>
                    <span class="text-xs opacity-50 block">Cliff Date</span>
                    <span class="font-mono font-bold"
                        >{distribution.schedule?.cliffEndDate}</span
                    >
                </div>
            </div>
        </div>
    {/if}

    <!-- Status Area -->
    <div
        class="min-h-[120px] flex flex-col justify-center items-center text-center p-6 border border-dashed border-base-300 rounded-xl bg-base-100"
    >
        {#if isGeneratingMerkle}
            <div class="flex flex-col items-center gap-4" in:fly={{ y: 10 }}>
                <span class="loading loading-spinner loading-lg text-primary"
                ></span>
                <div>
                    <h3 class="font-bold">Generating Merkle Tree...</h3>
                    <p class="text-sm opacity-60">
                        Computing Pedersen hashes for {distribution?.recipients
                            ?.length || 0} recipients
                    </p>
                </div>
            </div>
        {:else if merkleError}
            <div
                class="text-error flex flex-col items-center gap-2"
                in:fly={{ y: 10 }}
            >
                <div
                    class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mb-2"
                >
                    <span class="text-2xl">⚠️</span>
                </div>
                <h3 class="font-bold">Generation Failed</h3>
                <p class="text-sm opacity-80 max-w-md">{merkleError}</p>
                <button
                    class="btn btn-sm btn-outline btn-error mt-4"
                    onclick={retry}
                >
                    Retry
                </button>
            </div>
        {:else if merkleResult}
            <div
                class="text-success flex flex-col items-center gap-2"
                in:fly={{ y: 10 }}
            >
                <div
                    class="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-2"
                >
                    <span class="text-2xl">✅</span>
                </div>
                <h3 class="font-bold">Ready for Deployment</h3>
                <p class="text-sm opacity-60 font-mono text-center">
                    Merkle Root:<br />
                    <span
                        class="bg-base-200 px-2 py-1 rounded text-xs select-all"
                        >0x{merkleResult.root.toString(16)}</span
                    >
                </p>
            </div>
        {:else}
            <div class="flex flex-col items-center gap-4">
                <span class="loading loading-spinner loading-lg text-primary"
                ></span>
                <p class="text-sm opacity-60">Loading distribution data...</p>
            </div>
        {/if}
    </div>
</div>
