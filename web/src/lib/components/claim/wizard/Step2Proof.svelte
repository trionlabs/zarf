<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { authStore } from "$lib/stores/authStore.svelte";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import {
        fetchGooglePublicKeys,
        findKeyById,
        decodeJwt,
    } from "$lib/auth/googleAuth";
    import type { Address } from "viem";

    // State
    let mode = $state<"connected" | "custom">("connected");
    let customAddress = $state("");
    let isGenerating = $state(false);
    let logs = $state<string[]>([]);
    let progress = $state(0);
    let worker: Worker | null = null;
    let error = $state<string | null>(null);

    // Derived
    let recipient = $derived(
        mode === "connected" ? walletStore.address : customAddress,
    );
    let isValidRecipient = $derived(
        mode === "connected"
            ? !!walletStore.address
            : /^0x[a-fA-F0-9]{40}$/.test(customAddress),
    );

    function addLog(msg: string) {
        logs = [...logs, `> ${msg}`];
    }

    async function startProofGeneration() {
        if (!isValidRecipient || !recipient) return;
        if (!authStore.gmail.jwt) {
            error = "Session expired. Please sign in again.";
            return;
        }

        isGenerating = true;
        error = null;
        progress = 0;
        logs = ["> Initializing Proof Engine..."];

        try {
            // 1. Fetch Google Keys (JWKs)
            addLog("Fetching Google Signing Keys...");
            const keys = await fetchGooglePublicKeys();
            const { header } = decodeJwt(authStore.gmail.jwt);
            const pubKey = findKeyById(keys, header.kid);

            if (!pubKey) {
                throw new Error(
                    `Could not find Google Public Key for ID: ${header.kid}`,
                );
            }
            addLog("Google Key Found & Verified.");

            // 2. Initialize Worker
            worker = new Worker(
                new URL("$lib/workers/proof.worker.ts", import.meta.url),
                { type: "module" },
            );

            worker.onmessage = (e) => {
                const { type, message, data } = e.data;

                if (type === "PROGRESS") {
                    addLog(message);
                    if (message.includes("Witness")) progress = 30;
                    if (message.includes("Proving")) progress = 60;
                } else if (type === "RESULT") {
                    progress = 100;
                    addLog("Proof Generated Successfully!");
                    
                    // Update Store
                    claimStore.setProof({
                        hex: data.proof,
                        publicInputs: data.publicInputs,
                    });
                    
                    // Explicitly set the recipient in the claim data if it was custom
                    // to ensure consistency in the Review step
                    if (claimStore.claimData) {
                        claimStore.claimData.recipient = recipient as string;
                    }

                    worker?.terminate();
                } else if (type === "ERROR") {
                    throw new Error(message);
                }
            };

            // 3. Send Payload
            worker.postMessage({
                type: "GENERATE_PROOF",
                payload: {
                    jwt: authStore.gmail.jwt,
                    publicKey: pubKey,
                    claimData: {
                        ...claimStore.claimData,
                        recipient: recipient, // Override recipient with user selection
                    },
                },
            });
        } catch (e: any) {
            console.error(e);
            error = e.message || "Proof generation failed";
            addLog(`ERROR: ${error}`);
            isGenerating = false;
            worker?.terminate();
        }
    }

    onDestroy(() => {
        if (worker) worker.terminate();
    });
</script>

<div class="card bg-base-100 shadow-xl max-w-2xl mx-auto mt-8">
    <div class="card-body">
        <h2 class="card-title justify-center mb-6">Privacy & Destination</h2>

        <!-- 1. Destination Selection -->
        <div class="form-control w-full mb-6">
            <label class="label">
                <span class="label-text font-bold">Send Tokens To</span>
            </label>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <button
                    class="btn btn-outline"
                    class:btn-active={mode === "connected"}
                    onclick={() => (mode = "connected")}
                >
                    Connected Wallet
                </button>
                <button
                    class="btn btn-outline"
                    class:btn-active={mode === "custom"}
                    onclick={() => (mode = "custom")}
                >
                    Custom Address
                </button>
            </div>

            {#if mode === "connected"}
                <div
                    class="p-4 bg-base-200 rounded-lg flex items-center justify-between"
                >
                    <span class="font-mono text-sm"
                        >{walletStore.address || "No Wallet Connected"}</span
                    >
                    {#if !walletStore.isConnected}
                        <button
                            class="btn btn-sm btn-primary"
                            onclick={() => walletStore.requestConnection()}
                        >
                            Connect
                        </button>
                    {/if}
                </div>
            {:else}
                <input
                    type="text"
                    placeholder="0x..."
                    class="input input-bordered font-mono"
                    bind:value={customAddress}
                />
                <div class="label">
                    <span class="label-text-alt text-warning">
                        Warning: This address will be public in the transaction.
                    </span>
                </div>
            {/if}
        </div>

        <!-- 2. Terminal / Progress -->
        <div class="mockup-code bg-neutral text-neutral-content h-64 overflow-y-auto mb-6">
            {#each logs as log}
                <pre data-prefix=">"><code>{log.replace('>', '')}</code></pre>
            {/each}
            {#if isGenerating && progress < 100}
                <pre data-prefix=">"><code class="animate-pulse">_</code></pre>
            {/if}
        </div>

        <!-- 3. Action -->
        <div class="card-actions justify-center">
            {#if isGenerating}
                <button class="btn btn-disabled w-full">
                    <span class="loading loading-spinner"></span>
                    Generating Zero-Knowledge Proof...
                </button>
            {:else}
                <button
                    class="btn btn-primary w-full"
                    disabled={!isValidRecipient}
                    onclick={startProofGeneration}
                >
                    Generate Proof & Continue
                </button>
            {/if}
        </div>
        
        {#if error}
            <div class="alert alert-error mt-4">
                <span>{error}</span>
            </div>
        {/if}
    </div>
</div>