<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { claimStore } from "../../../stores/claimStore.svelte";

    import {
        CheckCircle,
        ShieldCheck,
        AlertTriangle,
        RefreshCw,
        Wallet,
    } from "lucide-svelte";
    import { recipientId } from "@zarf/core/contracts";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    let progress = $state(0);
    let statusMessage = $state("Initializing...");
    let isGenerating = $state(true);
    let error = $state<string | null>(null);
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;

    let { contractAddress } = $props<{ contractAddress: string }>();

    let email = $derived(claimStore.email);
    let selectedEpoch = $derived(claimStore.selectedEpoch);
    let targetWallet = $derived(claimStore.targetWallet);

    async function generateProofForClaim() {
        if (advanceTimer) {
            clearTimeout(advanceTimer);
            advanceTimer = null;
        }

        error = null;
        isGenerating = true;
        progress = 0;
        statusMessage = "Loading proof modules...";

        try {
            if (!selectedEpoch && claimStore.epochs.length > 0) {
                claimStore.selectNextClaimableEpoch();
            }

            if (!email || !selectedEpoch || !targetWallet) {
                claimStore.reset();
                return;
            }

            const [
                { computeLeaf },
                { fetchPublicLeaves, getProofForLeaf },
                { getPublicKeyForJwt },
                { generateClaimProof },
            ] = await Promise.all([
                import("@zarf/core/crypto/merkleTree"),
                import("../../../utils/proofHelpers"),
                import("../../../utils/googleJwk"),
                import("@zarf/core/zk"),
            ]);

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

            const jwt = claimStore.jwt;
            if (!jwt) throw new Error("JWT is missing.");

            const publicKey = await getPublicKeyForJwt(jwt);
            const recipient = await recipientId(contractAddress, targetWallet);

            statusMessage = "Initializing ZK Worker...";
            progress = 40;

            const result = await generateClaimProof(
                jwt,
                publicKey,
                {
                    email: email.toLowerCase().trim(),
                    salt,
                    amount,
                    merkleProof,
                    merkleRoot,
                    recipient,
                    unlockTime: BigInt(unlockTime),
                },
                (message) => {
                    statusMessage = message;
                    if (progress < 90) progress += 10;
                },
            );

            claimStore.setProof(result);
            progress = 100;
            statusMessage = "Proof Ready!";
            isGenerating = false;
            advanceTimer = setTimeout(() => {
                claimStore.nextStep();
            }, 1000);
        } catch (e: any) {
            error = e.message || "Proof generation failed.";
            isGenerating = false;
            statusMessage = "Proof generation failed.";
        }
    }

    function retryProofGeneration() {
        void generateProofForClaim();
    }

    function changeWallet() {
        if (advanceTimer) {
            clearTimeout(advanceTimer);
            advanceTimer = null;
        }
        claimStore.state.currentStep = 3;
    }

    onMount(() => {
        void generateProofForClaim();
    });

    onDestroy(() => {
        if (advanceTimer) {
            clearTimeout(advanceTimer);
        }
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
                    <p class="text-sm text-zen-fg-subtle font-light max-w-sm mx-auto">
                        Your eligibility is still intact. No transaction was sent, and you can retry proof generation from the same wallet.
                    </p>
                    <p class="text-xs text-zen-error/80 font-mono max-w-sm mx-auto break-words">
                        {error}
                    </p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm mx-auto">
                    <ZenButton
                        variant="primary"
                        class="h-12 rounded-2xl text-[10px] uppercase tracking-widest font-bold"
                        onclick={retryProofGeneration}
                    >
                        <RefreshCw class="w-3.5 h-3.5" />
                        Retry Proof
                    </ZenButton>
                    <ZenButton
                        variant="secondary"
                        class="h-12 rounded-2xl text-[10px] uppercase tracking-widest font-bold"
                        onclick={changeWallet}
                    >
                        <Wallet class="w-3.5 h-3.5" />
                        Change Wallet
                    </ZenButton>
                </div>
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
