<script lang="ts">
    import VestingStatusCard from "../../../components/claim/VestingStatusCard.svelte";
    let { contractAddress } = $props<{ contractAddress: string }>();
</script>

<VestingStatusCard {contractAddress} />
