<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { authStore } from "$lib/stores/authStore.svelte";
    import { readVestingContract } from "$lib/contracts/contracts";
    import { validateClaimData } from "$lib/utils/inputValidator";
    import { UploadCloud, FileJson, AlertCircle } from "lucide-svelte";
    import type { Address } from "viem";

    let { contractAddress } = $props<{ contractAddress: string }>();

    let isDragging = $state(false);
    let error = $state<string | null>(null);
    let dragCounter = 0;

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
            const contractData = await readVestingContract(
                contractAddress as Address,
            );
            const chainRoot = contractData.merkleRoot;

            if (data.merkleRoot.toLowerCase() !== chainRoot.toLowerCase()) {
                throw new Error(
                    `File mismatch. The uploaded file is for a different distribution.`,
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

<div
    class="card bg-base-100 border border-base-content/10 shadow-sm transition-all duration-200"
>
    <div class="card-body p-8 space-y-6">
        <div>
            <h2 class="card-title text-lg font-bold">Upload Credentials</h2>
            <p class="text-sm text-base-content/60">
                Please upload the <code>claim-data.json</code> file provided to you.
            </p>
        </div>

        <!-- Drag Drop Zone -->
        <div
            class="group relative border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300 cursor-pointer overflow-hidden
            {isDragging
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-base-content/10 hover:border-primary/40 hover:bg-base-200/40'}"
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

            <div
                class="flex flex-col items-center gap-5 transition-transform duration-300 relative z-10 {isDragging
                    ? 'scale-105'
                    : ''}"
            >
                <div
                    class="w-20 h-20 rounded-3xl bg-base-100 border border-base-content/10 flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-500 ease-out"
                >
                    {#if isDragging}
                        <UploadCloud
                            class="w-8 h-8 text-primary animate-bounce"
                        />
                    {:else}
                        <FileJson
                            class="w-8 h-8 text-base-content/40 group-hover:text-primary transition-colors"
                        />
                    {/if}
                </div>

                <div class="space-y-1">
                    <p
                        class="text-xl font-bold tracking-tight text-base-content/90 group-hover:text-primary transition-colors"
                    >
                        {isDragging ? "Drop to upload" : "Click to upload"}
                    </p>
                    <p
                        class="text-sm text-base-content/50 font-mono opacity-70"
                    >
                        claim-data.json
                    </p>
                </div>
            </div>
        </div>

        {#if error}
            <div
                class="alert alert-error text-xs shadow-sm border border-error/20 bg-error/10"
            >
                <AlertCircle class="w-4 h-4" />
                <span>{error}</span>
            </div>
        {/if}
    </div>
</div>
