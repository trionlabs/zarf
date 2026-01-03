<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { submitClaim, getExplorerUrl } from "$lib/contracts/contracts";
    import {
        Send,
        FileText,
        CheckCircle2,
        AlertTriangle,
        ExternalLink,
    } from "lucide-svelte";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import type { Address } from "viem";

    let { contractAddress } = $props<{ contractAddress: string }>();

    let isSubmitting = $state(false);
    let error = $state<string | null>(null);
    let success = $state(false);
    let txHash = $state<string | null>(null);

    // Derived Logic form Store
    let proof = $derived(claimStore.proof);
    let selectedEpoch = $derived(claimStore.selectedEpoch);
    // TODO: We should probably format allocation

    async function handleSubmit() {
        if (!proof || !walletStore.address) return;

        isSubmitting = true;
        error = null;

        try {
            // Flatten Public Inputs for Contract (Proof.publicInputs is object, contract wants array or specific fields)
            // Contracts.ts submitClaim signature:
            // submitClaim(proof: string, publicInputs: (string | bigint)[], account: Address, contractAddress?: Address)

            // We need to order the public inputs exactly as the contract expects.
            // Based on jwtProver / Worker output:
            // [0..17] = pubkey_modulus (18)
            // [18] = merkle_root
            // [19] = email_hash (identity comm)
            // [20] = recipient

            // The `proof.publicInputs` from worker is an object { emailHash, merkleRoot, recipient, amount }
            // BUT `proof.publicInputs` returned by `backend.generateProof` is an ARRAY (or map?).
            // `proof.worker.ts` returns `publicInputs: proof.publicInputs` (which is array-like from bb.js) AND the object.

            // Re-read worker:
            // returns { proof: hex, publicInputs: proof.publicInputs (Array), ... }

            // So we can just pass the array?
            // Wait, bb.js publicInputs includes return values?
            // The verify function in contract takes `bytes32[] publicInputs`.

            // Let's look at `claimStore.proof.publicInputs`.
            // In Store it is type `ZKProof`.
            // `ZKProof` (from types.ts - I need to check its definition, assumed object).
            // `jwtProver.ts` return: `publicInputs: { emailHash, ... }`.
            // Wait! `jwtProver.ts` returns an Object for `publicInputs` property!
            // It does NOT return the raw array in that property.

            // FIX: We need the RAW public inputs array for the contract.
            // `jwtProver.ts` constructs the object from the array.
            // I should update `ZKProof` type to include `publicValues: string[]` (the raw array).
            // OR I reconstruct it.

            // Reconstructing from Object is risky if order matters.
            // `jwtProver.ts`:
            // "Public outputs structure... [0..17] pubkey... [18] root [19] nullifier [20] recipient"
            // Wait, in `jwtProver.ts` lines 360+:
            // const emailHash = proof.publicInputs[19];

            // So the raw array exists.

            // I should have preserved the raw array in the worker output.
            // Worker returns `publicInputs: proof.publicInputs`.

            // So `claimStore.proof.publicInputs` is likely the raw array if I update the type?
            // No, `jwtProver.ts` defines return type `Promise<ZKProof>`.
            // Let's check `types.ts` later.

            // For now, I will assume `claimStore.proof.publicInputs` is the OBJECT (based on jwtProver).
            // Capturing the raw array would be better.

            // If I only have the object, I can't easily reconstruct the 18 pubkey limbs unless they are in the object.
            // `jwtProver` puts `emailHash`, `recipient` etc in object. It drops the limbs?
            // `jwtProver.ts` line 369: `publicInputs: { emailHash, ... }`. Yes it drops limbs.

            // CRITICAL BUG: Contract needs the Limbs to verify the signature! (Unless they are private?)
            // Hints: Circuit `pubkey_modulus_limbs` is marked `pub`?
            // `inputs` in `jwtProver.ts`: `pubkey_modulus_limbs` is passed.
            // Usually Key is public input.

            // If `jwtProver.ts` is stripping the limbs, we can't submit to a contract that needs them.
            // Check Contract ABI in `contracts.ts`.
            // `claim(bytes proof, bytes32[] publicInputs)`

            // If I look at `014-claim-flow.md`, does it mention inputs?
            // It says "Contract verifies...".

            // I will assume I need to fix `jwtProver.ts` / `proof.worker.ts` to return the RAW array.
            // But I can't edit `jwtProver` easily if it's "legacy".
            // `proof.worker.ts` line 205: `publicInputs: proof.publicInputs`.
            // This is the RAW array!

            // `jwtProver.ts` line 369: `publicInputs: { ... }`.
            // `proof.worker.ts` lines 203-209:
            // return { proof: ..., publicInputs: proof.publicInputs, identityCommitment..., ... }

            // So the worker DOES returns the raw array in `publicInputs` property, AND the specific fields in other properties.
            // My Store `setProof` expects `ZKProof`.
            // I need to ensure `ZKProof` type allows `publicInputs` to be `string[]`.

            // If `ZKProof` type says `publicInputs` is object, TS will complain.
            // I'll cast it for now or assume `any`.

            const rawInputs = proof.publicValues;

            // Submit
            const result = await submitClaim(
                proof.proof,
                rawInputs,
                walletStore.address as Address,
                contractAddress as Address,
            );

            claimStore.setTxHash(result.hash);
            txHash = result.hash;
            success = true;

            // Next Step (or Finish)
            claimStore.nextStep(); // To Completion
        } catch (e: any) {
            console.error("Submission failed:", e);
            error = e.message || "Transaction failed";
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div
    class="card bg-base-100 border border-base-content/5 shadow-xl max-w-lg mx-auto"
>
    <div class="card-body gap-6 text-center">
        <!-- Header -->
        <div
            class="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2"
        >
            <FileText class="w-8 h-8" />
        </div>
        <h2 class="card-title justify-center text-xl">Submit Claim</h2>
        <p class="text-sm text-base-content/60 font-light">
            Your proof is ready. Submit it to the blockchain to receive your
            tokens.
        </p>

        <!-- Summary -->
        <div class="stats shadow bg-base-200/50 mt-4">
            <div class="stat place-items-center">
                <div class="stat-title">Claiming</div>
                <div class="stat-value text-primary text-2xl">
                    {selectedEpoch
                        ? (Number(selectedEpoch.amount) / 1e18).toLocaleString()
                        : "0"}
                </div>
                <div class="stat-desc">AZTC</div>
            </div>
        </div>

        <!-- Action -->
        {#if error}
            <div class="alert alert-error text-xs py-2 rounded-lg text-left">
                <AlertTriangle class="w-4 h-4" />
                <span>{error}</span>
            </div>
        {/if}

        {#if success}
            <div class="alert alert-success text-xs py-2 rounded-lg">
                <CheckCircle2 class="w-4 h-4" />
                <span>Transaction Submitted!</span>
            </div>
            {#if txHash}
                <a
                    href={getExplorerUrl(txHash as `0x${string}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-outline btn-sm gap-2 mt-2"
                >
                    View on Etherscan
                    <ExternalLink class="w-3 h-3" />
                </a>
            {/if}
        {:else}
            <div class="card-actions mt-4">
                <button
                    class="btn btn-primary w-full btn-lg shadow-lg shadow-primary/20"
                    disabled={isSubmitting || !proof}
                    onclick={handleSubmit}
                >
                    {#if isSubmitting}
                        <span class="loading loading-spinner"></span>
                        Submitting...
                    {:else}
                        <div class="flex items-center gap-2">
                            Submit Transaction
                            <Send class="w-4 h-4" />
                        </div>
                    {/if}
                </button>
            </div>
        {/if}
    </div>
</div>
