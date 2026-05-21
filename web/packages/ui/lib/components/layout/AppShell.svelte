<script lang="ts">
    import ZarfNavbar from "./ZarfNavbar.svelte";
    import type { Snippet } from "svelte";

    interface Props {
        nav?: Snippet;
        children: Snippet;
        showEmail?: boolean;
        showWallet?: boolean;
        showWalletBadge?: boolean;
        showNetworkToggle?: boolean;
        /**
         * Class applied to the outermost wrapper. Use to set background
         * canvas paint and selection colors (defaults are inherited from
         * the body / theme tokens, so most apps can leave this empty).
         */
        rootClass?: string;
        /**
         * Class applied to the inner content container that wraps the
         * children snippet. Controls page width and padding. Default
         * suits full-width dashboards; bounded layouts can pass e.g.
         * "w-full max-w-7xl mx-auto p-8 lg:p-12".
         */
        containerClass?: string;
    }

    let {
        nav,
        children,
        showEmail = false,
        showWallet = false,
        showWalletBadge = false,
        showNetworkToggle = true,
        rootClass = "",
        containerClass = "w-full p-6 lg:p-8",
    }: Props = $props();
</script>

<div class="min-h-screen font-sans {rootClass}">
    <ZarfNavbar
        {showEmail}
        {showWallet}
        {showWalletBadge}
        {showNetworkToggle}
    >
        {#if nav}{@render nav()}{/if}
    </ZarfNavbar>

    <!-- tabindex=-1 lets the skip-link target receive programmatic focus -->
    <main id="main" tabindex="-1" class="min-h-[calc(100vh-4rem)]">
        <div class="h-full">
            <div class={containerClass}>
                {@render children()}
            </div>
        </div>
    </main>
</div>
