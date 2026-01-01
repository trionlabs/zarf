<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { onDestroy } from "svelte";

    let timeLeft = $state("");

    const interval = setInterval(() => {
        if (!claimStore.cliffEndDate) {
            timeLeft = "--";
            return;
        }

        const now = Date.now();
        const end = claimStore.cliffEndDate.getTime();
        const diff = end - now;

        if (diff <= 0) {
            timeLeft = "Unlocking now...";
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
            (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        timeLeft = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }, 1000);

    onDestroy(() => {
        clearInterval(interval);
    });
</script>

<!-- Zen Pro Style: Minimal, light background, subtle border -->
<div
    class="flex flex-col items-center justify-center p-8 bg-base-200/20 rounded-xl border border-base-content/5"
>
    <span
        class="text-[10px] uppercase tracking-wider text-base-content/40 font-medium mb-3"
        >Cliff Period Active</span
    >
    <div class="text-4xl font-mono font-light text-base-content tracking-tight">
        {timeLeft}
    </div>
    <span class="text-xs text-base-content/40 font-light mt-2"
        >until tokens start unlocking</span
    >
</div>
