<script lang="ts">
    import StatsPanel from "./StatsPanel.svelte";
    import ValidationStatus from "./ValidationStatus.svelte";
</script>

<div class="h-full flex flex-col gap-8 p-8 bg-base-200/30">
    <!-- Basket Summary -->
    <StatsPanel />

    <!-- Divider -->
    <div class="border-t-[0.5px] border-base-content/10"></div>

    <!-- Validation Status -->
    <div class="flex-1">
        <ValidationStatus />
    </div>
</div>
