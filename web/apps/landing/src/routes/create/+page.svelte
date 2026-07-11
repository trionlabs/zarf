<script lang="ts">
    import ZarfLogo from '@zarf/ui/components/brand/ZarfLogo.svelte';
    import ThemeToggle from '@zarf/ui/components/layout/ThemeToggle.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';

    // Question-led chooser: both answers now land in the merged create app, but
    // they still fork at step 0 because eligibility is either email/ZK or wallet.
    const createBaseUrl = (import.meta.env.VITE_ZK_CREATE_URL ?? 'https://create.zarf.to').replace(
        /\/+$/,
        '',
    );
    const zkCreateUrl = createBaseUrl;
    const airdropCreateUrl = `${createBaseUrl}/airdrop`;

    const cardClass =
        'answer-card flex flex-col rounded-2xl border border-base-content/8 bg-base-content/[0.02] p-7 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/30 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100';
    const cardHover = ' hover:border-base-content/20 hover:bg-base-content/[0.04]';
</script>

<svelte:head>
    <title>Who are you sending to? — Zarf</title>
    <meta
        name="description"
        content="Send tokens on Stellar to people by email or to wallets by address. Pick how you reach recipients and Zarf sets up the rest."
    />
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="create-page relative min-h-screen bg-base-100 text-base-content">
    <header class="flex items-center justify-between px-6 py-5">
        <a href="/" aria-label="Zarf home" class="inline-flex items-center">
            <ZarfLogo size="md" />
        </a>
        <ThemeToggle />
    </header>

    <main class="mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-8 text-center">
        <!-- HERO: the question is the hero. -->
        <div class="create-hero flex flex-col items-center">
            <p
                class="enter mb-3 text-xs font-medium uppercase tracking-[0.2em] text-zen-fg-muted"
                style="--enter-delay: 0ms"
            >
                Create a distribution
            </p>
            <h1
                class="enter mb-4 text-3xl font-semibold tracking-tight sm:text-4xl"
                style="--enter-delay: 70ms"
            >
                Who are you sending to?
            </h1>
            <p
                class="enter mb-12 max-w-md text-sm leading-relaxed text-zen-fg-muted"
                style="--enter-delay: 150ms"
            >
                How you reach recipients shapes the whole distribution. You can run the other kind
                anytime for a different campaign.
            </p>
        </div>

        <!-- ANSWERS: each card completes the question and routes to a create app. -->
        <div class="chooser-grid grid w-full gap-5 sm:grid-cols-2">
            <!-- Answer: email — always available. -->
            <a
                href={zkCreateUrl}
                data-answer="email"
                class="group enter {cardClass}{cardHover}"
                style="--enter-delay: 240ms"
            >
                {@render emailCard()}
            </a>

            <a
                href={airdropCreateUrl}
                data-answer="wallet"
                class="group enter {cardClass}{cardHover}"
                style="--enter-delay: 320ms"
            >
                {@render walletCard()}
            </a>
        </div>
    </main>
</div>

{#snippet emailCard()}
    <!-- VISUAL MOTIF: recipients as MASKED identities — a small envelope badge and
         a private recipient list whose names are redacted to rows of dots. Encodes
         the email axis: you address people, but the list stays private. -->
    <div class="card-visual card-visual--email mb-5 flex items-center gap-3" aria-hidden="true">
        <span
            class="motif-badge flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-base-content/5 text-base-content/70"
        >
            <!-- lucide "mail" (inlined to keep landing's initial bundle lean) -->
            <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
        </span>
        <ul class="motif-chips motif-chips--masked flex flex-1 flex-col gap-1.5">
            <li class="motif-chip flex items-center gap-2">
                <span class="motif-avatar h-4 w-4 shrink-0 rounded-full bg-base-content/10"></span>
                <span class="motif-mask h-2 w-[70%] rounded-full"></span>
            </li>
            <li class="motif-chip flex items-center gap-2">
                <span class="motif-avatar h-4 w-4 shrink-0 rounded-full bg-base-content/10"></span>
                <span class="motif-mask h-2 w-[88%] rounded-full"></span>
            </li>
            <li class="motif-chip flex items-center gap-2">
                <span class="motif-avatar h-4 w-4 shrink-0 rounded-full bg-base-content/10"></span>
                <span class="motif-mask h-2 w-[54%] rounded-full"></span>
            </li>
        </ul>
    </div>
    <h2 class="mb-2 text-lg font-semibold">People with an email</h2>
    <p class="card-lede mb-5 text-sm leading-relaxed text-zen-fg-muted">
        Send to email addresses. Recipients claim without connecting a wallet first.
    </p>
    <dl class="card-facts mb-6 flex-1 space-y-2.5 text-sm">
        <div class="card-fact flex items-center justify-between gap-4">
            <dt class="text-zen-fg-muted">Sign-in</dt>
            <dd class="font-medium text-base-content">Email address</dd>
        </div>
        <div class="card-fact flex items-center justify-between gap-4">
            <dt class="text-zen-fg-muted">Recipient list</dt>
            <dd class="font-medium text-base-content">Private</dd>
        </div>
        <div class="card-fact flex items-center justify-between gap-4">
            <dt class="text-zen-fg-muted">Vesting</dt>
            <dd class="font-medium text-base-content">Supported</dd>
        </div>
    </dl>
    <ZenButton variant="primary" size="md" class="w-full">Send to emails</ZenButton>
{/snippet}

{#snippet walletCard()}
    <!-- VISUAL MOTIF: recipients as PUBLIC addresses — a wallet badge and a short,
         readable list of truncated Stellar keys (G…XXXX). Encodes the wallet axis:
         the recipient list is open and on-chain. -->
    <div class="card-visual card-visual--wallet mb-5 flex items-center gap-3" aria-hidden="true">
        <span
            class="motif-badge flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-base-content/5 text-base-content/70"
        >
            <!-- lucide "wallet" (inlined to keep landing's initial bundle lean) -->
            <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path
                    d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1-1 1v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"
                />
            </svg>
        </span>
        <ul class="motif-chips motif-chips--addr flex flex-1 flex-col gap-1.5">
            <li class="motif-chip flex items-center gap-2">
                <span class="motif-node h-4 w-4 shrink-0 rounded-[3px] bg-base-content/10"></span>
                <span class="motif-addr">G…7X4Q</span>
            </li>
            <li class="motif-chip flex items-center gap-2">
                <span class="motif-node h-4 w-4 shrink-0 rounded-[3px] bg-base-content/10"></span>
                <span class="motif-addr">G…A2BK</span>
            </li>
            <li class="motif-chip flex items-center gap-2">
                <span class="motif-node h-4 w-4 shrink-0 rounded-[3px] bg-base-content/10"></span>
                <span class="motif-addr">G…9F1P</span>
            </li>
        </ul>
    </div>
    <h2 class="mb-2 text-lg font-semibold">Wallets with an address</h2>
    <p class="card-lede mb-5 text-sm leading-relaxed text-zen-fg-muted">
        Send to wallet addresses. Everyone on the list can claim right away.
    </p>
    <dl class="card-facts mb-6 flex-1 space-y-2.5 text-sm">
        <div class="card-fact flex items-center justify-between gap-4">
            <dt class="text-zen-fg-muted">Sign-in</dt>
            <dd class="font-medium text-base-content">Not required</dd>
        </div>
        <div class="card-fact flex items-center justify-between gap-4">
            <dt class="text-zen-fg-muted">Recipient list</dt>
            <dd class="font-medium text-base-content">Public, on-chain</dd>
        </div>
        <div class="card-fact flex items-center justify-between gap-4">
            <dt class="text-zen-fg-muted">Vesting</dt>
            <dd class="font-medium text-base-content">Not available</dd>
        </div>
    </dl>
    <ZenButton variant="secondary" size="md" class="w-full">Send to wallets</ZenButton>
{/snippet}

<style>
    /* ============================================================
       ORCHESTRATED ENTRANCE (pure CSS — 0 JS budget)
       eyebrow → question → lede → email card → wallet card, each
       fly-up + fade on a soft ease-out. Per-item delay comes from
       the inline `--enter-delay` var; last item lands at ~820ms.

       Pure CSS (not svelte/transition) is deliberate: the /create
       route is the app's worst-case initial closure and sits ~1.6KB
       under the gz budget, so we spend zero JS here. It is also a
       better no-JS story — CSS keyframes paint the animation without
       hydration, and the SSR HTML already carries the final (visible)
       state, so scripting-off users simply see the content.
       ============================================================ */
    .enter {
        animation: card-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1) var(--enter-delay, 0ms) backwards;
    }

    @keyframes card-enter {
        from {
            opacity: 0;
            transform: translateY(14px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* ---- Motif: masked (email) vs. public (wallet) recipient rows ---- */
    /* Masked name = a row of dots rendered from the current text colour, so it
       tracks base-content in both themes with no extra colour tokens. */
    .motif-mask {
        background-image: radial-gradient(
            circle at center,
            color-mix(in oklch, var(--color-base-content) 32%, transparent) 1.4px,
            transparent 1.7px
        );
        background-size: 9px 100%;
        background-repeat: repeat-x;
        background-position: left center;
    }

    /* Public address = readable, truncated Stellar key. Monospace + muted so it
       reads as on-chain data rather than a name. */
    .motif-addr {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.6875rem;
        line-height: 1;
        letter-spacing: 0.02em;
        color: color-mix(in oklch, var(--color-base-content) 58%, transparent);
    }

    /* ---- Hover micro-interaction (live <a> cards only) ---- */
    /* The inert "Coming soon" card is a <div>, so `a.answer-card` never matches
       it: no lift, no motif response — it stays quiet at opacity-70. */
    a.answer-card {
        transition:
            transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.2s ease,
            background-color 0.2s ease,
            box-shadow 0.2s ease;
    }

    a.answer-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 14px 30px -16px
            color-mix(in oklch, var(--color-base-content) 28%, transparent);
    }

    .motif-badge {
        transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .motif-chip {
        transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .motif-chip:nth-child(2) {
        transition-delay: 0.03s;
    }
    .motif-chip:nth-child(3) {
        transition-delay: 0.06s;
    }

    /* Envelope badge lifts a touch; the masked rows nudge together (private,
       held close). */
    a.answer-card:hover .card-visual--email .motif-badge {
        transform: scale(1.06);
    }
    a.answer-card:hover .card-visual--email .motif-chip {
        transform: translateX(3px);
    }

    /* Address rows cascade open (public, spreading out). */
    a.answer-card:hover .card-visual--wallet .motif-badge {
        transform: scale(1.06);
    }
    a.answer-card:hover .card-visual--wallet .motif-chip:nth-child(1) {
        transform: translateX(2px);
    }
    a.answer-card:hover .card-visual--wallet .motif-chip:nth-child(2) {
        transform: translateX(5px);
    }
    a.answer-card:hover .card-visual--wallet .motif-chip:nth-child(3) {
        transform: translateX(8px);
    }

    /* ---- Reduced motion: collapse to static, opacity only, no movement ----
       The global reduced-motion rule zeroes durations but NOT animation-delay,
       which would leave delayed items hidden during their (now instant) stagger.
       Killing the animation outright makes every element paint in its final,
       visible state, and drops all hover/motif movement. */
    @media (prefers-reduced-motion: reduce) {
        .enter {
            animation: none;
        }
        a.answer-card,
        a.answer-card:hover,
        .motif-badge,
        .motif-chip {
            transition: none;
            transform: none;
        }
    }
</style>
