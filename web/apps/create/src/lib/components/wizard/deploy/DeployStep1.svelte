<script lang="ts">
    import { deployStore } from "../../../stores/deployStore.svelte";

    import { fly } from "svelte/transition";
    import { AlertTriangle, CheckCircle2 } from "lucide-svelte";

    import { wizardStore } from "../../../stores/wizardStore.svelte";
    import { parseUnits } from "viem";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    // Direct state access from Runes Class
    let distribution = $derived(deployStore.distribution);
    let isGeneratingMerkle = $derived(deployStore.isGeneratingMerkle);
    let merkleResult = $derived(deployStore.merkleResult);
    let merkleError = $derived(deployStore.merkleError);

    async function generateTree() {
        if (!distribution) return;

        deployStore.startMerkleGeneration();

        try {
            const tokenDecimals = wizardStore.tokenDetails.tokenDecimals ?? 18;

            // Map recipients to { email, amount } format expected by service
            // CRITICAL: Convert amount to WEI using token decimals
            // This ensures the Merkle Root matches the on-chain wei values
            const entries = distribution.recipients.map((r: any) => ({
                email: r.email || "",
                // Convert human-readable amount (e.g. 100) to wei (e.g. 100000...)
                // We pass BigInt directly to avoid precision loss
                amount: parseUnits(String(r.amount), tokenDecimals),
            }));

            // ADR-023: Discrete Vesting - Generator needs Schedule
            const { processWhitelist } = await import(
                "@zarf/core/crypto/merkleTree"
            );
            const result = await processWhitelist(
                entries,
                distribution.schedule,
            );
            deployStore.setMerkleResult(result);
        } catch (e: any) {
            console.error("Merkle generation error:", e);
            deployStore.setMerkleError(
                e.message || "Failed to generate Merkle Tree",
            );
        }
    }

    $effect(() => {
        // If we already have a result, don't regenerate
        if (merkleResult) return;

        // If data is ready and not already generating or error, start
        // This fixes the race condition where distribution loads after mount
        if (distribution && !isGeneratingMerkle && !merkleError) {
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
        <p class="text-zen-fg-muted">
            We are generating the cryptographic proofs required for your
            recipients to claim their tokens.
        </p>
    </div>

    {#if distribution}
        <!-- Summary Card -->
        <div
            class="bg-zen-fg/5 rounded-lg p-4 mb-8 border border-zen-border"
        >
            <h3
                class="font-bold text-sm uppercase tracking-wider text-zen-fg-muted mb-3"
            >
                Distribution Summary
            </h3>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <span class="text-xs text-zen-fg-subtle block"
                        >Token Amount</span
                    >
                    <span class="font-mono font-bold text-lg"
                        >{Number(distribution.amount).toLocaleString()}</span
                    >
                </div>
                <div>
                    <span class="text-xs text-zen-fg-subtle block"
                        >Recipients</span
                    >
                    <span class="font-mono font-bold text-lg"
                        >{distribution.recipients.length}</span
                    >
                </div>
                <div>
                    <span class="text-xs text-zen-fg-subtle block"
                        >Vesting Duration</span
                    >
                    <span class="font-mono font-bold"
                        >{distribution.schedule?.distributionDuration}
                        {distribution.schedule?.durationUnit}</span
                    >
                </div>
                <div>
                    <span class="text-xs text-zen-fg-subtle block"
                        >Cliff Date</span
                    >
                    <span class="font-mono font-bold"
                        >{distribution.schedule?.cliffEndDate}</span
                    >
                </div>
            </div>
        </div>
    {/if}

    <!-- Status Area -->
    <div
        class="min-h-[120px] flex flex-col justify-center items-center text-center p-6 border border-dashed border-zen-border rounded-xl bg-zen-bg"
    >
        {#if isGeneratingMerkle}
            <div class="flex flex-col items-center gap-4" in:fly={{ y: 10 }}>
                <div
                    class="w-8 h-8 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"
                ></div>
                <div>
                    <h3 class="font-bold">Generating Merkle Tree...</h3>
                    <p class="text-sm text-zen-fg-subtle">
                        Computing Pedersen hashes for {distribution?.recipients
                            ?.length || 0} recipients
                    </p>
                </div>
            </div>
        {:else if merkleError}
            <div
                class="text-zen-error flex flex-col items-center gap-2"
                in:fly={{ y: 10 }}
            >
                <div
                    class="w-12 h-12 rounded-full bg-zen-error/10 flex items-center justify-center mb-2"
                >
                    <AlertTriangle class="w-6 h-6 text-zen-error" />
                </div>
                <h3 class="font-bold">Generation Failed</h3>
                <p class="text-sm opacity-80 max-w-md">{merkleError}</p>
                <ZenButton
                    variant="danger"
                    class="mt-4 border border-zen-error"
                    onclick={retry}
                >
                    Retry
                </ZenButton>
            </div>
        {:else if merkleResult}
            <div
                class="text-zen-success flex flex-col items-center gap-2"
                in:fly={{ y: 10 }}
            >
                <div
                    class="w-12 h-12 rounded-full bg-zen-success/10 flex items-center justify-center mb-2"
                >
                    <CheckCircle2 class="w-6 h-6 text-zen-success" />
                </div>
                <h3 class="font-bold">Ready for Deployment</h3>
                <p
                    class="text-sm text-zen-fg-subtle font-mono text-center"
                >
                    Merkle Root:<br />
                    <span
                        class="bg-zen-fg/10 px-2 py-1 rounded text-xs select-all"
                        >0x{merkleResult.root.toString(16)}</span
                    >
                </p>
            </div>
        {:else}
            <div class="flex flex-col items-center gap-4">
                <div
                    class="w-8 h-8 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"
                ></div>
                <p class="text-sm text-zen-fg-subtle">
                    Loading distribution data...
                </p>
            </div>
        {/if}
    </div>
</div>
