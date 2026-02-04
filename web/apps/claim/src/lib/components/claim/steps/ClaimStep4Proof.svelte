<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { claimStore } from "../../../stores/claimStore.svelte";

    import {
        fetchPublicLeaves,
        getProofForLeaf,
    } from "../../../utils/proofHelpers";
    import { getPublicKeyForJwt } from "../../../utils/googleJwk";
    import {
        Loader2,
        CheckCircle,
        ShieldCheck,
        AlertTriangle,
    } from "lucide-svelte";
    import ProofWorker from "../../../workers/proof.worker.ts?worker";
    import type { ProofRequest } from "../../../workers/proof.worker";
    import type { ZKProof } from "@zarf/ui/types";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

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

            const { computeLeaf } = await import("@zarf/core/crypto/merkleTree");

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

<div
    class="space-y-12 py-10 animate-in fade-in slide-in-from-top-4 duration-500"
>
    <div class="max-w-xl mx-auto text-center space-y-10">
        {#if error}
            <div class="space-y-6">
                <div
                    class="w-16 h-16 rounded-full bg-zen-error/5 text-zen-error flex items-center justify-center mx-auto border border-zen-error/10"
                >
                    <AlertTriangle class="w-8 h-8" />
                </div>
                <div class="space-y-2">
                    <h2
                        class="text-xl font-medium text-zen-fg tracking-tight"
                    >
                        Generation Failed
                    </h2>
                    <p
                        class="text-sm text-zen-fg-subtle font-light max-w-xs mx-auto italic"
                    >
                        {error}
                    </p>
                </div>
                <ZenButton
                    variant="secondary"
                    class="px-8 h-12 rounded-2xl text-[10px] uppercase tracking-widest font-bold"
                    onclick={() => window.location.reload()}
                >
                    Retry Generation
                </ZenButton>
            </div>
        {:else if isGenerating}
            <!-- Sophisticated Loading State -->
            <div class="relative w-32 h-32 mx-auto">
                <!-- Abstract Rings -->
                <div
                    class="absolute inset-0 border-[1px] border-zen-border-subtle rounded-full"
                ></div>
                <div
                    class="absolute inset-2 border-[1px] border-zen-border-subtle rounded-full border-dashed"
                ></div>

                <!-- Main Spinner -->
                <div
                    class="absolute inset-0 border-t-2 border-zen-primary rounded-full animate-[spin_3s_linear_infinite]"
                ></div>

                <!-- Center Icon -->
                <div class="absolute inset-0 flex items-center justify-center">
                    <ShieldCheck
                        class="w-8 h-8 text-zen-primary/40 animate-pulse"
                    />
                </div>
            </div>

            <div class="space-y-6">
                <div class="space-y-2">
                    <h2
                        class="text-xl font-medium text-zen-fg tracking-tight"
                    >
                        Securing Identity
                    </h2>
                    <p class="text-xs text-zen-fg-subtle font-light italic">
                        {statusMessage}
                    </p>
                </div>

                <!-- Custom Minimal Progress -->
                <div class="max-w-[240px] mx-auto space-y-3">
                    <div
                        class="h-1 w-full bg-zen-fg/5 rounded-full overflow-hidden"
                    >
                        <div
                            class="bg-zen-primary h-full rounded-full transition-all duration-700 ease-out"
                            style="width: {progress}%"
                        ></div>
                    </div>
                    <div class="flex justify-between items-center px-1">
                        <span
                            class="text-[9px] uppercase tracking-[0.2em] text-zen-fg-faint font-bold"
                            >Privacy Layer</span
                        >
                        <span class="text-[9px] font-mono text-zen-primary/60"
                            >{progress}%</span
                        >
                    </div>
                </div>

                <p
                    class="text-[10px] text-zen-fg-faint max-w-[280px] mx-auto leading-relaxed"
                >
                    Zero-knowledge proofs prove you own the allocation <span
                        class="text-zen-fg-muted font-medium"
                        >without linking</span
                    > your email to your wallet address.
                </p>
            </div>
        {:else}
            <!-- Success Transition -->
            <div class="space-y-6 animate-in zoom-in duration-500">
                <div
                    class="w-16 h-16 rounded-full bg-zen-success/10 text-zen-success flex items-center justify-center mx-auto border border-zen-success/10"
                >
                    <CheckCircle class="w-8 h-8" />
                </div>
                <div class="space-y-1">
                    <h2 class="text-xl font-medium tracking-tight">
                        Proof Successful
                    </h2>
                    <p class="text-xs text-zen-fg-subtle italic">
                        Finalizing claim parameters...
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>
