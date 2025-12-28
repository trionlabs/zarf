<script lang="ts">
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { getMerkleProof } from "$lib/services/merkleTree";
    import { fly } from "svelte/transition";

    // Direct derived state
    let distribution = $derived(deployStore.distribution);
    let merkleResult = $derived(deployStore.merkleResult);
    let isBackupDownloaded = $derived(deployStore.isBackupDownloaded);
    let isBackupConfirmed = $derived(deployStore.isBackupConfirmed);

    function generateDownload() {
        if (!distribution || !merkleResult) return;

        // Generate full kit
        const recipients = merkleResult.claims.map((claim: any) => {
            const proof = getMerkleProof(merkleResult.tree, claim.leafIndex);

            // Convert everything to hex strings for safe storage
            return {
                email: claim.email,
                amount: claim.amount,
                salt: claim.salt, // Critical!
                leafIndex: claim.leafIndex,
                leaf: "0x" + claim.leaf.toString(16),
                emailHash: "0x" + (claim.emailHash?.toString(16) || "0"),
                merkleProof: {
                    siblings: proof.siblings.map(
                        (sib: bigint) => "0x" + sib.toString(16),
                    ),
                    indices: proof.indices,
                },
            };
        });

        const kit = {
            distributionId: distribution.id,
            distributionName: distribution.name,
            createdAt: new Date().toISOString(),
            merkleRoot: "0x" + merkleResult.root.toString(16),
            totalAmount: distribution.amount,
            recipients,
        };

        const jsonString = JSON.stringify(kit, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${distribution.name.toLowerCase().replace(/\s+/g, "-")}-distribution-kit.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        deployStore.setBackupDownloaded(true);
    }

    function handleConfirmChange(e: Event) {
        const target = e.target as HTMLInputElement;
        deployStore.setBackupConfirmed(target.checked);
    }
</script>

<div class="p-8">
    <div class="mb-6">
        <h2 class="text-2xl font-bold mb-2">Backup Distribution Data</h2>
        <div class="alert alert-warning shadow-sm">
            <span class="text-2xl">⚠️</span>
            <div>
                <h3 class="font-bold">CRITICAL STEP: Prevent Data Loss</h3>
                <div class="text-xs">
                    You MUST save the Distribution Kit. It contains the <b
                        >secret salts</b
                    >
                    required for your recipients to claim their tokens. If this data
                    is lost, the tokens will be
                    <b>permanently locked</b>.
                </div>
            </div>
        </div>
    </div>

    <div
        class="card bg-base-100 border border-base-300 shadow-md max-w-lg mx-auto"
    >
        <div class="card-body items-center text-center">
            <div
                class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4"
            >
                <span class="text-3xl">💾</span>
            </div>

            <h3 class="card-title text-lg">Download Distribution Kit</h3>
            <p class="text-sm opacity-60 mb-6">
                This JSON file contains all cryptographic proofs and access
                codes. Store it securely.
            </p>

            <button
                class="btn btn-primary btn-wide mb-4"
                onclick={generateDownload}
            >
                {#if isBackupDownloaded}
                    Download Again
                {:else}
                    📥 Download JSON
                {/if}
            </button>

            {#if isBackupDownloaded}
                <div class="form-control" in:fly={{ y: 5 }}>
                    <label class="label cursor-pointer justify-start gap-4">
                        <input
                            type="checkbox"
                            class="checkbox checkbox-primary"
                            checked={isBackupConfirmed}
                            onchange={handleConfirmChange}
                        />
                        <span class="label-text text-left">
                            I confirm that I have downloaded and securely saved<br
                            />
                            the distribution kit file.
                        </span>
                    </label>
                </div>
            {/if}
        </div>
    </div>
</div>
