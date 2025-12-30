<script lang="ts">
    import ThemeToggle from "$lib/components/layout/ThemeToggle.svelte";
    import WalletConnectButton from "$lib/components/layout/WalletConnectButton.svelte";

    let { hideActions = false } = $props<{ hideActions?: boolean }>();
</script>

<header
    class="h-12 bg-base-100 border-b border-base-content/5 flex items-center justify-between px-6 sticky top-0 z-50"
>
    <!-- Logo -->
    <a href="/" class="flex items-center gap-2 group">
        <div
            class="w-5 h-5 rounded bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="w-3 h-3 stroke-primary-content"
                stroke-width="2.5"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                />
            </svg>
        </div>
        <span
            class="text-sm font-semibold tracking-tight opacity-80 group-hover:opacity-100 transition-opacity"
            >Zarf</span
        >
    </a>

    <!-- Minimal Actions -->
    <div class="flex items-center gap-4">
        {#if !hideActions}
            <a
                href="/docs"
                class="text-[11px] text-base-content/40 hover:text-base-content transition-colors uppercase tracking-widest font-medium"
            >
                Docs
            </a>
            <div class="w-px h-4 bg-base-content/10"></div>
            <WalletConnectButton />
            <div class="w-px h-4 bg-base-content/10"></div>
            <ThemeToggle />
        {/if}
    </div>
</header>
