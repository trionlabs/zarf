<script lang="ts">
    import { readVestingContract } from "$lib/contracts/contracts";
    import { Search, ArrowRight, AlertCircle } from "lucide-svelte";
    import type { Address } from "viem";

    let { onImport } = $props<{ onImport: (addr: string) => void }>();

    let address = $state("");
    let error = $state<string | null>(null);
    let isLoading = $state(false);

    async function handleSubmit() {
        const addr = address.trim();

        // Check for common mistake: Transaction Hash
        if (/^0x[a-fA-F0-9]{64}$/.test(addr)) {
            error =
                "This is a Transaction Hash, not a Contract Address. Please check the 'Logs' tab on Etherscan to find the Deployed Contract Address.";
            return;
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
            error = "Invalid Ethereum Address";
            return;
        }

        isLoading = true;
        error = null;

        try {
            await readVestingContract(address as Address);
            onImport(address);
        } catch (e) {
            error = "Could not find a valid Zarf Vesting contract";
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="space-y-2">
    <label class="label pl-1" for="contract-input">
        <span class="label-text font-medium text-base-content/80"
            >Contract Information</span
        >
    </label>

    <!-- Inlined DaisyUI markup (no custom wrapper) -->
    <div class="form-control w-full space-y-2">
        <div
            class="join w-full shadow-sm hover:shadow-md transition-shadow duration-300"
        >
            <div
                class="join-item bg-base-200/30 flex items-center px-4 border border-base-content/10 border-r-0"
            >
                <Search class="w-4 h-4 text-base-content/40" />
            </div>
            <input
                type="text"
                id="contract-input"
                placeholder="0x..."
                class="input input-lg input-bordered join-item w-full font-mono text-base bg-base-100 focus:bg-base-100 border-base-content/10 focus:border-primary/50 text-base-content/80 placeholder:text-base-content/20 transition-all duration-300"
                class:input-error={error !== null}
                bind:value={address}
                onkeydown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
                type="button"
                class="btn btn-lg join-item border-base-content/10 hover:border-primary/30 hover:bg-primary/5 text-base-content/40 hover:text-primary transition-all duration-300"
                onclick={handleSubmit}
                disabled={isLoading}
            >
                {#if isLoading}
                    <span class="loading loading-spinner loading-sm"></span>
                {:else}
                    <ArrowRight class="w-4 h-4" />
                {/if}
            </button>
        </div>

        {#if error}
            <div
                class="flex items-center gap-1.5 text-xs text-error font-medium mt-1.5 animate-in slide-in-from-top-1"
            >
                <AlertCircle class="w-3.5 h-3.5" />
                {error}
            </div>
        {:else}
            <p class="text-xs text-base-content/40 font-light mt-1.5">
                Paste the distribution contract address to verify eligibility.
            </p>
        {/if}
    </div>
</div>
