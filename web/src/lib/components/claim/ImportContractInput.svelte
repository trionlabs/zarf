<script lang="ts">
    import { readVestingContract } from "$lib/contracts/contracts";
    import { ArrowRight } from "lucide-svelte";
    import AddressInput from "$lib/components/ui/AddressInput.svelte";
    import type { Address } from "viem";

    let { onImport } = $props<{ onImport: (addr: string) => void }>();

    let address = $state("");
    let error = $state<string | null>(null);
    let isLoading = $state(false);

    async function handleSubmit() {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
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

    <AddressInput
        bind:value={address}
        placeholder="0x..."
        {error}
        {isLoading}
        onAction={handleSubmit}
        actionIcon={ArrowRight}
    />

    {#if !error}
        <div class="label pb-0 pl-1">
            <span class="label-text-alt text-base-content/40 font-light">
                Paste the distribution contract address to verify eligibility.
            </span>
        </div>
    {/if}
</div>
