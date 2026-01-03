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

    let { contractAddress } = $props<{ contractAddress: string }>();

    let email = $derived(claimStore.email);
    let selectedEpoch = $derived(claimStore.selectedEpoch);
    let targetWallet = $derived(claimStore.targetWallet);

    onMount(async () => {
        try {
            if (!selectedEpoch && claimStore.epochs.length > 0) {
                claimStore.selectNextClaimableEpoch();
            }

            if (!email || !selectedEpoch || !targetWallet) {
                claimStore.reset();
                return;
            }

            statusMessage = "Fetching Merkle Data...";
            progress = 10;

            const amount = BigInt(selectedEpoch.amount);
            const salt = selectedEpoch.salt;
            const unlockTime = selectedEpoch.unlockTime;

            const leaf = await computeLeaf(
                email,
                amount,
                BigInt(salt),
                unlockTime,
            );

            const leaves = await fetchPublicLeaves(contractAddress);

            statusMessage = "Building Merkle Proof...";
            progress = 20;

            const { proof: merkleProof, root: merkleRoot } =
                await getProofForLeaf(leaf, leaves);

            statusMessage = "Starting Proof Worker...";
            worker = new ProofWorker();

            worker.onmessage = (e) => {
                const { type, message, data } = e.data;
                if (type === "PROGRESS") {
                    statusMessage = message;
                    if (progress < 90) progress += 10;
                } else if (type === "RESULT") {
                    const result = data as ZKProof;
                    claimStore.setProof(result);
                    progress = 100;
                    statusMessage = "Proof Ready!";
                    isGenerating = false;
                    setTimeout(() => {
                        claimStore.nextStep();
                    }, 1000);
                } else if (type === "ERROR") {
                    error = message;
                    isGenerating = false;
                }
            };

            const jwt = claimStore.jwt;
            if (!jwt) throw new Error("JWT is missing.");

            const publicKey = await getPublicKeyForJwt(jwt);

            const payload: ProofRequest["payload"] = {
                jwt,
                publicKey,
                claimData: {
                    email: email.toLowerCase().trim(),
                    salt,
                    amount: "0x" + amount.toString(16),
                    merkleProof: {
                        siblings: merkleProof.siblings,
                        indices: merkleProof.indices.map((i) => i.toString()),
                    },
                    merkleRoot: "0x" + merkleRoot.toString(16),
                    recipient: targetWallet,
                    unlockTime: "0x" + unlockTime.toString(16),
                },
            };

            statusMessage = "Initializing ZK Worker...";
            progress = 40;
            worker.postMessage({ type: "GENERATE_PROOF", payload });
        } catch (e: any) {
            error = e.message;
            isGenerating = false;
        }
    });

    onDestroy(() => {
        if (worker) worker.terminate();
    });
</script>

<div class="space-y-8 text-center py-4">
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
            <h2 class="text-xl font-bold">Generating Zero-Knowledge Proof</h2>
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
                revealing your identity.<br />(Takes ~30-60 seconds)
            </p>
        </div>
    {:else}
        <div class="flex flex-col items-center gap-4 animate-in zoom-in">
            <div
                class="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center"
            >
                <CheckCircle class="w-8 h-8" />
            </div>
            <div>
                <h2 class="text-xl font-bold">Proof Generated</h2>
                <p class="text-base-content/60">Redirecting to submission...</p>
            </div>
        </div>
    {/if}
</div>
