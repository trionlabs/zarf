<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";

    // Parse dates
    const cliffDate = $derived(
        wizardStore.schedule.cliffEndDate
            ? new Date(wizardStore.schedule.cliffEndDate)
            : null,
    );

    const durationMonths = $derived(
        wizardStore.schedule.distributionDurationMonths || 12,
    );

    const endDate = $derived(
        cliffDate
            ? new Date(
                  cliffDate.getTime() +
                      durationMonths * 30 * 24 * 60 * 60 * 1000,
              )
            : null,
    );

    // Format dates
    const formatDate = (date: Date | null) => {
        if (!date) return "—";
        return date.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
        });
    };

    const cliffLabel = $derived(formatDate(cliffDate));
    const endLabel = $derived(formatDate(endDate));

    // Calculate progress positions (0-100)
    const hasValidDates = $derived(cliffDate !== null);
</script>

<div class="space-y-4">
    <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">
        Vesting Timeline
    </h3>

    <div class="py-4">
        <!-- Timeline SVG -->
        <div class="relative h-16">
            <!-- Background Line -->
            <div
                class="absolute top-1/2 left-0 right-0 h-[1px] bg-base-content/10 -translate-y-1/2"
            ></div>

            <!-- Progress Line (filled portion) -->
            {#if hasValidDates}
                <div
                    class="absolute top-1/2 left-0 h-[2px] bg-primary -translate-y-1/2 transition-all duration-500"
                    style="width: 0%"
                ></div>
            {/if}

            <!-- Markers -->
            <div class="absolute inset-0 flex justify-between items-center">
                <!-- Start (Now) -->
                <div class="flex flex-col items-center gap-2">
                    <div
                        class="w-3 h-3 rounded-full border-2 border-base-content/30 bg-base-100"
                    ></div>
                    <span class="text-[10px] opacity-50">Now</span>
                </div>

                <!-- Cliff -->
                <div class="flex flex-col items-center gap-2">
                    <div
                        class="w-4 h-4 rounded-full border-2 transition-all duration-300 {hasValidDates
                            ? 'border-primary bg-primary/20'
                            : 'border-base-content/30 bg-base-100'}"
                    ></div>
                    <span
                        class="text-[10px] transition-all {hasValidDates
                            ? 'text-primary'
                            : 'opacity-50'}"
                    >
                        {cliffLabel}
                    </span>
                </div>

                <!-- End -->
                <div class="flex flex-col items-center gap-2">
                    <div
                        class="w-3 h-3 rounded-full border-2 transition-all duration-300 {hasValidDates
                            ? 'border-success bg-success/20'
                            : 'border-base-content/30 bg-base-100'}"
                    ></div>
                    <span
                        class="text-[10px] transition-all {hasValidDates
                            ? 'text-success'
                            : 'opacity-50'}"
                    >
                        {endLabel}
                    </span>
                </div>
            </div>
        </div>

        <!-- Legend -->
        <div class="flex justify-between text-[9px] opacity-40 mt-2 px-1">
            <span>0% vested</span>
            <span>Cliff ends</span>
            <span>100% vested</span>
        </div>
    </div>
</div>
