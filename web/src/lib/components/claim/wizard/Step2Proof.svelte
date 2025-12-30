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

<div
    class="card bg-base-100 border border-base-content/10 shadow-sm transition-all duration-200"
>
    <div class="card-body p-8 space-y-6">
        <div>
            <h2 class="card-title text-lg font-bold">Privacy & Destination</h2>
            <p class="text-sm text-base-content/60">
                Generate a Zero-Knowledge proof to claim tokens without
                revealing your identity.
            </p>
        </div>

        <!-- 1. Destination Selection -->
        <div class="form-control w-full mb-6">
            <div class="label px-0">
                <span
                    class="label-text font-bold text-base-content/70 uppercase tracking-wider text-xs"
                    >Destination Wallet</span
                >
            </div>

            <div class="grid grid-cols-2 gap-4 mb-6">
                <button
                    class="btn btn-lg border-base-content/10 hover:border-primary/50 relative overflow-hidden group
                    {mode === 'connected'
                        ? 'btn-neutral text-neutral-content'
                        : 'btn-ghost bg-base-200/30'}"
                    onclick={() => (mode = "connected")}
                >
                    <span class="relative z-10">Connected Wallet</span>
                </button>
                <button
                    class="btn btn-lg border-base-content/10 hover:border-primary/50 relative overflow-hidden
                    {mode === 'custom'
                        ? 'btn-neutral text-neutral-content'
                        : 'btn-ghost bg-base-200/30'}"
                    onclick={() => (mode = "custom")}
                >
                    <span class="relative z-10">Custom Address</span>
                </button>
            </div>

            {#if mode === "connected"}
                <div
                    class="p-4 bg-base-200/50 rounded-xl border border-base-content/5 flex items-center justify-between"
                >
                    <div class="flex items-center gap-3">
                        <div
                            class="w-2 h-2 rounded-full {walletStore.isConnected
                                ? 'bg-success'
                                : 'bg-base-content/20'}"
                        ></div>
                        <span class="font-mono text-sm opacity-70"
                            >{walletStore.address ||
                                "No Wallet Connected"}</span
                        >
                    </div>
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
                <div class="space-y-2">
                    <input
                        type="text"
                        placeholder="0x..."
                        class="input input-lg input-bordered w-full font-mono text-sm bg-base-100 focus:border-primary/50"
                        bind:value={customAddress}
                    />
                    <div
                        class="flex items-start gap-2 text-warning text-xs px-1"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="w-4 h-4 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            ><path
                                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                            ></path><line x1="12" y1="9" x2="12" y2="13"
                            ></line><line x1="12" y1="17" x2="12.01" y2="17"
                            ></line></svg
                        >
                        <span class="opacity-80">
                            Privacy Warning: Using a custom address makes the
                            link between your proof and this address public
                            on-chain.
                        </span>
                    </div>
                </div>
            {/if}
        </div>

        <!-- 2. Terminal / Progress -->
        <div class="space-y-2">
            <div class="label px-0">
                <span
                    class="label-text font-bold text-base-content/70 uppercase tracking-wider text-xs"
                    >Proof Generation Log</span
                >
            </div>
            <div
                class="mockup-code bg-[#1a1b26] text-[#a9b1d6] h-64 overflow-y-auto mb-6 rounded-2xl shadow-inner border border-base-content/5 text-sm leading-relaxed scrollbar-thin scrollbar-thumb-white/10"
            >
                {#each logs as log}
                    <pre data-prefix=">"><code class="opacity-90"
                            >{log.replace(">", "")}</code
                        ></pre>
                {/each}
                {#if isGenerating && progress < 100}
                    <pre data-prefix=">"><code
                            class="animate-pulse text-primary">_</code
                        ></pre>
                {/if}
            </div>
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
