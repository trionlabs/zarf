<script lang="ts">
    import { themeStore } from "../../stores/themeStore.svelte";
    import { Moon, Sun } from "lucide-svelte";

    function toggle() {
        themeStore.toggleTheme();
    }
</script>

<button
    onclick={toggle}
    class="
        w-9 h-9 rounded-full
        flex items-center justify-center
        text-zen-fg-muted hover:text-zen-fg
        hover:bg-zen-fg/5
        transition-all duration-200
        group
    "
    aria-label="Toggle Theme"
>
    {#if themeStore.isDark}
        <Sun class="w-4 h-4 transition-transform group-hover:rotate-12" />
    {:else}
        <Moon class="w-4 h-4 transition-transform group-hover:-rotate-12" />
    {/if}
</button>
