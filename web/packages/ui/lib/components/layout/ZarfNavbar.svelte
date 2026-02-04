<script lang="ts">
    import ThemeToggle from "@zarf/ui/components/layout/ThemeToggle.svelte";
    import WalletConnectButton from "@zarf/ui/components/wallet/WalletConnectButton.svelte";
    import WalletBadge from "@zarf/ui/components/wallet/WalletBadge.svelte";
    import ZarfLogo from "@zarf/ui/components/brand/ZarfLogo.svelte";
    import { authStore } from "@zarf/ui/stores/authStore.svelte";
    import { redirectToGoogle } from "@zarf/ui/utils/googleAuth";
    import type { Snippet } from "svelte";

    let {
        hideActions = false,
        showEmail = false,
        showWallet = false,
        showWalletBadge = false,
        children,
    } = $props<{
        hideActions?: boolean;
        showEmail?: boolean;
        showWallet?: boolean;
        showWalletBadge?: boolean;
        children?: Snippet;
    }>();
</script>

<header
    class="h-16 bg-zen-bg border-b-[0.5px] border-zen-border-subtle flex items-center justify-between px-6 sticky top-0 z-50"
>
    <!-- Left Section: Logo & Nav -->
    <div class="flex items-center gap-8">
        <!-- Logo → Landing -->
        <a href="https://zarf.to" class="group opacity-80 hover:opacity-100 transition-opacity">
            <ZarfLogo />
        </a>

        <!-- Main Navigation (Injected) -->
        {#if !hideActions && children}
            <nav class="hidden md:flex items-center gap-6">
                {@render children()}
            </nav>
        {/if}
    </div>

    <!-- Minimal Actions -->
    <div class="flex items-center gap-4">
        {#if !hideActions}
            <a
                href="/docs"
                class="text-[11px] text-zen-fg-subtle hover:text-zen-fg transition-colors uppercase tracking-widest font-medium"
            >
                Docs
            </a>

            <!-- Email Section (Claim app) -->
            {#if showEmail}
                <div class="w-px h-4 bg-zen-border"></div>
                {#if authStore.isAuthenticated}
                    <div class="flex items-center gap-2">
                        <span
                            class="text-xs text-zen-fg-muted font-mono hidden sm:inline-block"
                        >
                            {authStore.gmail.email}
                        </span>
                        <button
                            class="px-2 py-1 text-xs rounded text-zen-error/70 hover:text-zen-error hover:bg-zen-error/10 transition-colors"
                            onclick={() => authStore.clearGmailSession()}
                            aria-label="Sign out"
                        >
                            Log out
                        </button>
                    </div>
                {:else}
                    <button
                        class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-zen-fg/5 hover:bg-zen-fg/10 text-zen-fg transition-colors"
                        onclick={() => redirectToGoogle()}
                    >
                        <svg class="w-4 h-4" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        <span>Sign in</span>
                    </button>
                {/if}
            {/if}

            <!-- Wallet Section (Create app - full button) -->
            {#if showWallet}
                <div class="w-px h-4 bg-zen-border"></div>
                <WalletConnectButton />
            {/if}

            <!-- Wallet Badge (Claim app - view only) -->
            {#if showWalletBadge}
                <div class="w-px h-4 bg-zen-border"></div>
                <WalletBadge />
            {/if}

            <div class="w-px h-4 bg-zen-border"></div>
            <ThemeToggle />
        {/if}
    </div>
</header>
