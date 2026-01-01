<script lang="ts">
    import { themeStore } from "$lib/stores/themeStore.svelte";
    import { onMount } from "svelte";
    import { Palette } from "lucide-svelte";
    import type { Theme } from "$lib/stores/types";

    onMount(() => {
        themeStore.restore();
    });

    function setTheme(theme: Theme) {
        themeStore.setTheme(theme);
        // Deselect the button to close dropdown (optional, but good UX on some devices)
        const elem = document.activeElement as HTMLElement;
        if (elem) {
            elem.blur();
        }
    }
</script>

<div class="dropdown dropdown-end">
    <div
        tabindex="0"
        role="button"
        class="btn btn-ghost btn-circle"
        aria-label="Change Theme"
    >
        <Palette class="w-5 h-5" />
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <ul
        tabindex="0"
        class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-200 rounded-box w-52 mt-4"
    >
        <li>
            <button
                onclick={() => setTheme("nord")}
                class={themeStore.current === "nord" ? "active" : ""}
            >
                Nord
            </button>
        </li>
        <li>
            <button
                onclick={() => setTheme("wireframe")}
                class={themeStore.current === "wireframe" ? "active" : ""}
            >
                Wireframe
            </button>
        </li>
        <li>
            <button
                onclick={() => setTheme("dim")}
                class={themeStore.current === "dim" ? "active" : ""}
            >
                Dim (Dark)
            </button>
        </li>
    </ul>
</div>
