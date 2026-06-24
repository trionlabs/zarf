<script lang="ts">
    import ZarfLogo from '@zarf/ui/components/brand/ZarfLogo.svelte';
    import ThemeToggle from '@zarf/ui/components/layout/ThemeToggle.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';

    // Double-mode front door: this page does NOT merge the two products — it
    // links to the two EXISTING, separately-deployed create apps. The funnels
    // fork at step 0 and never reconverge, so a chooser is the only honest
    // unification (see plans/double-mode-design.md).
    //
    // Cross-app URLs are per-environment. The ZK create app has a prod domain;
    // the airdrop create app does not yet, so it falls back to '#' and its card
    // renders as a non-interactive "Coming soon" state.
    const zkCreateUrl = (import.meta.env.VITE_ZK_CREATE_URL ?? 'https://create.zarf.to').replace(
        /\/+$/,
        '',
    );
    const airdropCreateUrl =
        (import.meta.env.VITE_AIRDROP_CREATE_URL ?? '').replace(/\/+$/, '') || '#';
    const airdropReady = airdropCreateUrl !== '#';

    const cardClass =
        'flex flex-col rounded-2xl border border-base-content/8 bg-base-content/[0.02] p-7 text-left transition';
    const cardHover = ' hover:border-base-content/20 hover:bg-base-content/[0.04]';
</script>

<svelte:head>
    <title>Create a distribution — Zarf</title>
    <meta
        name="description"
        content="Choose how to distribute tokens on Stellar: a private ZK distribution by email, or a public wallet-address airdrop."
    />
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="relative min-h-screen bg-base-100 text-base-content">
    <header class="flex items-center justify-between px-6 py-5">
        <a href="/" aria-label="Zarf home" class="inline-flex items-center">
            <ZarfLogo size="md" />
        </a>
        <ThemeToggle />
    </header>

    <main class="mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-8 text-center">
        <p class="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-zen-fg-muted">
            Create a distribution
        </p>
        <h1 class="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            How do you want to distribute?
        </h1>
        <p class="mb-12 max-w-md text-sm leading-relaxed text-zen-fg-muted">
            Two ways to send tokens on Stellar. Pick the one that fits — you can always run the
            other for a different campaign.
        </p>

        <div class="grid w-full gap-5 sm:grid-cols-2">
            <!-- Private ZK (email) — always available -->
            <a href={zkCreateUrl} class="group {cardClass}{cardHover}">
                {@render zkCard()}
            </a>

            <!-- Public wallet airdrop — link when configured, inert "Coming soon" otherwise.
                 An inert card is a real <div> (no href, not in the tab order), NOT a
                 fake-disabled <a href="#"> (which stays keyboard-navigable). -->
            {#if airdropReady}
                <a href={airdropCreateUrl} class="group {cardClass}{cardHover}">
                    {@render airdropCard()}
                </a>
            {:else}
                <div class="{cardClass} opacity-70" aria-disabled="true">
                    {@render airdropCard()}
                </div>
            {/if}
        </div>
    </main>
</div>

{#snippet zkCard()}
    <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-base-content/5">
        <!-- lucide "lock" (inlined to keep landing's initial bundle lean) -->
        <svg
            class="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    </div>
    <h2 class="mb-2 text-lg font-semibold">Private &middot; ZK</h2>
    <p class="mb-6 flex-1 text-sm leading-relaxed text-zen-fg-muted">
        Recipients identified by <strong class="font-medium text-base-content">email</strong>.
        Claims are zero-knowledge and private; vesting schedules supported.
    </p>
    <ZenButton variant="primary" size="md" class="w-full">Choose private</ZenButton>
{/snippet}

{#snippet airdropCard()}
    <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-base-content/5">
        <!-- lucide "wallet" (inlined to keep landing's initial bundle lean) -->
        <svg
            class="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            <path
                d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1-1 1v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"
            />
        </svg>
    </div>
    <h2 class="mb-2 text-lg font-semibold">Public airdrop</h2>
    <p class="mb-6 flex-1 text-sm leading-relaxed text-zen-fg-muted">
        Recipients identified by <strong class="font-medium text-base-content"
            >wallet address</strong
        >. Public list, instant or deadline-bound claim. Lightweight, no login.
    </p>
    <ZenButton variant="secondary" size="md" class="w-full" disabled={!airdropReady}>
        {airdropReady ? 'Choose airdrop' : 'Coming soon'}
    </ZenButton>
{/snippet}
