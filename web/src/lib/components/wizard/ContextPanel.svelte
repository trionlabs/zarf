<script lang="ts">
    import StatsPanel from "./StatsPanel.svelte";
    import VestingTimeline from "./VestingTimeline.svelte";
    import ValidationStatus from "./ValidationStatus.svelte";
</script>

<div class="h-full flex flex-col gap-8 p-8 bg-base-200/30">
    <!-- Stats -->
    <StatsPanel />

    <!-- Divider -->
    <div class="border-t-[0.5px] border-base-content/10"></div>

    <!-- Timeline -->
    <VestingTimeline />

    <!-- Divider -->
    <div class="border-t-[0.5px] border-base-content/10"></div>

    <!-- Validation -->
    <div class="flex-1">
        <ValidationStatus />
    </div>
</div>
