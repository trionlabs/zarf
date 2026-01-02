<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { computeLeaf } from "$lib/crypto/merkleTree";
    import {
        fetchPublicLeaves,
        getProofForLeaf,
    } from "$lib/utils/proofHelpers";
    import { getPublicKeyForJwt } from "$lib/utils/googleJwk";
    import { Loader2, CheckCircle, ShieldCheck } from "lucide-svelte";
    import ProofWorker from "$lib/workers/proof.worker.ts?worker";
    import type { ProofRequest } from "$lib/workers/proof.worker";
    import type { ZKProof } from "$lib/types";

    let progress = $state(0);
    let statusMessage = $state("Initializing...");
    let worker: Worker | null = null;
    let isGenerating = $state(true);
    let error = $state<string | null>(null);

    // Get input data
    // Get input data
    let { contractAddress } = $props<{ contractAddress: string }>();

    const { email, selectedEpoch, targetWallet } = claimStore;

    onMount(async () => {
        try {
            // Guard Pattern
            if (!email || !selectedEpoch || !targetWallet) {
                console.warn(
                    "[ClaimStep4] Missing claim data. Resetting flow...",
                );
                claimStore.reset();
                return;
            }

            statusMessage = "Fetching Merkle Data...";
            progress = 10;

            // 1. Calculate Leaf using Selected Epoch Data (ADR-023: Discrete Vesting)
            const amount = BigInt(selectedEpoch.amount);
            const salt = selectedEpoch.salt; // This is the Epoch Secret
            const unlockTime = selectedEpoch.unlockTime;

            // Leaf = Pedersen(Identity, Amount, UnlockTime)
            const leaf = await computeLeaf(email, amount, salt, unlockTime);

            // 2. Fetch Tree Data (Mocked for now)
            const leaves = await fetchPublicLeaves(contractAddress);

            statusMessage = "Building Merkle Proof...";
            progress = 20;

            // 3. Generate Path
            const { proof: merkleProof, root: merkleRoot } =
                await getProofForLeaf(leaf, leaves);

            // 4. Initialize Worker
            statusMessage = "Starting Proof Worker...";
            worker = new ProofWorker();

            worker.onmessage = (e) => {
                const { type, message, data } = e.data;
                console.log(
                    "[ClaimStep4] Worker message received:",
                    type,
                    message,
                );

                if (type === "PROGRESS") {
                    statusMessage = message;
                    if (progress < 90) progress += 10;
                } else if (type === "RESULT") {
                    const result = data as ZKProof;
                    console.log("Proof Generated!", result);
                    claimStore.setProof(result);
                    progress = 100;
                    statusMessage = "Proof Ready!";
                    isGenerating = false;
                    setTimeout(() => {
                        claimStore.nextStep();
                    }, 1000);
                } else if (type === "ERROR") {
                    console.error("Worker Error:", message);
                    error = message;
                    isGenerating = false;
                }
            };

            worker.onerror = (e) => {
                console.error("[ClaimStep4] Worker crashed:", e.message, e);
                error = `Worker crashed: ${e.message || "Unknown error"}`;
                isGenerating = false;
            };

            // 5. Fetch Google Public Key
            statusMessage = "Fetching Google Public Key...";
            progress = 30;

            const jwt = claimStore.jwt;
            if (!jwt)
                throw new Error("JWT is missing. Please restart the flow.");

            const publicKey = await getPublicKeyForJwt(jwt);

            // 6. Build Request Payload with UnlockTime (ADR-023)
            const payload: ProofRequest["payload"] = {
                jwt,
                publicKey,
                claimData: {
                    email,
                    salt,
                    amount: "0x" + amount.toString(16),
                    merkleProof: {
                        siblings: merkleProof.siblings,
                        indices: merkleProof.indices.map((i) => i.toString()),
                    },
                    merkleRoot: "0x" + merkleRoot.toString(16),
                    recipient: targetWallet,
                    unlockTime: "0x" + unlockTime.toString(16), // Pass as Hex String
                },
            };

            // TODO: Fetch Real Keys workaround
            // For now, we rely on the Worker to handle it or we pass dummy if we are just testing UI flow.
            // But the Worker WILL fail if keys are missing for real generation.

            // Debug: Log payload being sent (without sensitive data)
            console.log("[ClaimStep4] Sending to worker:", {
                hasJwt: !!claimStore.jwt,
                jwtLength: claimStore.jwt?.length || 0,
                email: email ? `${email.substring(0, 5)}...` : null,
                hasSalt: !!salt,
                amount: payload.claimData.amount,
                hasPublicKey: Object.keys(payload.publicKey).length > 0,
            });

            // Sending
            statusMessage = "Initializing ZK Worker...";
            progress = 40;
            console.log("[ClaimStep4] Posting message to worker...");

            worker.postMessage({
                type: "GENERATE_PROOF",
                payload,
            });

            console.log(
                "[ClaimStep4] Message posted, waiting for worker response...",
            );
        } catch (e: any) {
            console.error("Setup failed:", e);
            error = e.message;
            isGenerating = false;
        }
    });

    onDestroy(() => {
        if (worker) {
            worker.terminate();
        }
    });
</script>

<div
    class="card bg-base-100 border border-base-content/5 shadow-xl max-w-lg mx-auto"
>
    <div class="card-body gap-8 text-center py-12">
        {#if error}
            <div class="text-error">
                <p class="font-bold">Generation Failed</p>
                <p class="text-sm opacity-80">{error}</p>
                <button
                    class="btn btn-sm btn-outline mt-4"
                    onclick={() => window.location.reload()}>Retry</button
                >
            </div>
        {:else if isGenerating}
            <!-- Generating State -->
            <div class="relative w-24 h-24 mx-auto">
                <div
                    class="absolute inset-0 border-4 border-base-200 rounded-full"
                ></div>
                <div
                    class="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"
                    style="border-right-color: transparent;"
                ></div>
                <div
                    class="absolute inset-0 flex items-center justify-center text-primary"
                >
                    <ShieldCheck class="w-8 h-8 animate-pulse" />
                </div>
            </div>

            <div class="space-y-2">
                <h2 class="text-xl font-bold">
                    Generating Zero-Knowledge Proof
                </h2>
                <p class="text-sm text-base-content/60 max-w-xs mx-auto">
                    {statusMessage}
                </p>

                <div
                    class="w-full max-w-xs mx-auto bg-base-200 rounded-full h-1.5 mt-4"
                >
                    <div
                        class="bg-primary h-1.5 rounded-full transition-all duration-500"
                        style="width: {progress}%"
                    ></div>
                </div>

                <p class="text-xs text-base-content/40 mt-4">
                    This preserves your privacy by proving eligibility without
                    revealing your identity.
                    <br />
                    (Takes ~30-60 seconds)
                </p>
            </div>
        {:else}
            <!-- Success State -->
            <div class="flex flex-col items-center gap-4 animate-in zoom-in">
                <div
                    class="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center"
                >
                    <CheckCircle class="w-8 h-8" />
                </div>
                <div>
                    <h2 class="text-xl font-bold">Proof Generated</h2>
                    <p class="text-base-content/60">
                        Redirecting to submission...
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>
