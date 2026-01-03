<script lang="ts">
    import VestingStatusCard from "$lib/components/claim/VestingStatusCard.svelte";
    let { contractAddress } = $props<{ contractAddress: string }>();
</script>

<VestingStatusCard {contractAddress} />
