<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { authStore } from "$lib/stores/authStore.svelte";
    import { readVestingContract } from "$lib/contracts/contracts";
    import { validateClaimData } from "$lib/utils/inputValidator";
    import type { Address } from "viem";

    let { contractAddress } = $props<{ contractAddress: string }>();

    let isDragging = $state(false);
    let error = $state<string | null>(null);
    let dragCounter = 0; // To handle child events

    // Helper to read file
    async function handleFile(file: File) {
        error = null;
        try {
            const text = await file.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch {
                throw new Error("File is not valid JSON.");
            }

            // 1. Strict Schema Validation
            const validation = validateClaimData(json);
            if (!validation.success || !validation.data) {
                throw new Error(validation.error);
            }
            const data = validation.data;

            // 2. Auth Email Validation
            const authEmail = authStore.gmail.email;
            if (!authEmail) {
                throw new Error(
                    "You are not signed in. Please reload and sign in.",
                );
            }
            if (data.email.toLowerCase() !== authEmail.toLowerCase()) {
                throw new Error(
                    `Email mismatch! File belongs to ${data.email}, but you are logged in as ${authEmail}.`,
                );
            }

            // 3. Chain Validation (Root Match)
            // Fetch contract data to verify the root matches
            const contractData = await readVestingContract(
                contractAddress as Address,
            );
            const chainRoot = contractData.merkleRoot;

            // Normalize for comparison
            if (data.merkleRoot.toLowerCase() !== chainRoot.toLowerCase()) {
                throw new Error(
                    `Integrity Check Failed. File root (${data.merkleRoot.slice(0, 6)}...) does not match Contract root (${chainRoot.slice(0, 6)}...). This file is not for this distribution.`,
                );
            }

            // 4. Success -> Store to State
            claimStore.setClaimData({
                email: data.email,
                salt: data.salt,
                merkleProof: data.merkleProof,
                merkleRoot: data.merkleRoot,
                vestedAmount: data.amount,
                recipient: data.recipient,
            });
        } catch (e: any) {
            console.error(e);
            error = e.message || "Failed to parse file";
        }
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        isDragging = false;
        dragCounter = 0;

        if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }

    function onDragEnter(e: DragEvent) {
        e.preventDefault();
        dragCounter++;
        isDragging = true;
    }

    function onDragLeave(e: DragEvent) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            isDragging = false;
        }
    }
</script>

<div class="card bg-base-100 shadow-xl max-w-2xl mx-auto mt-8">
    <div class="card-body">
        <h2 class="card-title justify-center mb-6">Upload Credentials</h2>

        <!-- Drag Drop Zone -->
        <div
            class="border-4 border-dashed rounded-xl p-12 text-center transition-colors duration-200 cursor-pointer relative"
            class:border-primary={isDragging}
            class:bg-base-200={isDragging}
            class:border-base-300={!isDragging}
            role="button"
            tabindex="0"
            ondrop={onDrop}
            ondragover={(e) => e.preventDefault()}
            ondragenter={onDragEnter}
            ondragleave={onDragLeave}
            onclick={() => document.getElementById("fileInput")?.click()}
            onkeydown={(e) =>
                e.key === "Enter" &&
                document.getElementById("fileInput")?.click()}
        >
            <input
                type="file"
                id="fileInput"
                accept=".json"
                class="hidden"
                onchange={(e) =>
                    e.currentTarget.files &&
                    handleFile(e.currentTarget.files[0])}
            />

            {#if isDragging}
                <p
                    class="text-primary font-bold text-xl scale-110 transform transition-transform"
                >
                    Drop it here!
                </p>
            {:else}
                <div class="flex flex-col items-center gap-4">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-16 h-16 text-base-content/40"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                    </svg>
                    <div>
                        <p class="text-lg font-medium">
                            Drag & Drop your claim file
                        </p>
                        <p class="text-sm opacity-60">
                            or click to browse (claim-data.json)
                        </p>
                    </div>
                </div>
            {/if}
        </div>

        {#if error}
            <div class="alert alert-error mt-4 shadow-lg">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    /></svg
                >
                <span>{error}</span>
            </div>
        {/if}
    </div>
</div>
