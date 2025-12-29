<script lang="ts">
    import { readVestingContract } from "$lib/contracts/contracts";
    import type { Address } from "viem";

    let { onImport } = $props<{ onImport: (addr: string) => void }>();

    let address = $state("");
    let error = $state("");
    let isLoading = $state(false);

    async function handleSubmit() {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            error = "Invalid Ethereum Address";
            return;
        }

        isLoading = true;
        error = "";

        try {
            // Validate it's a real Zarf contract
            await readVestingContract(address as Address);
            onImport(address);
        } catch (e) {
            error =
                "Could not find a valid Zarf Vesting contract at this address.";
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="card bg-base-100 shadow-xl">
    <div class="card-body">
        <h2 class="card-title justify-center mb-4">Import Distribution</h2>

        <div class="form-control w-full">
            <label class="label">
                <span class="label-text">Vesting Contract Address</span>
            </label>
            <div class="join">
                <input
                    type="text"
                    placeholder="0x..."
                    class="input input-bordered join-item w-full font-mono"
                    bind:value={address}
                    class:input-error={!!error}
                />
                <button
                    class="btn btn-primary join-item"
                    onclick={handleSubmit}
                    disabled={isLoading}
                >
                    {#if isLoading}
                        <span class="loading loading-spinner loading-sm"></span>
                    {:else}
                        Import
                    {/if}
                </button>
            </div>
            {#if error}
                <label class="label">
                    <span class="label-text-alt text-error">{error}</span>
                </label>
            {/if}
        </div>
    </div>
</div>
