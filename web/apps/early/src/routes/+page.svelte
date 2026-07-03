<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidateAll } from '$app/navigation';
    import { brand } from '$lib/brand';
    import type { PageData } from './$types';
    import type { EligibilityState } from '$lib/quests';

    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';

    import XLoginButton from '$lib/components/XLoginButton.svelte';
    import StatusHeader from '$lib/components/StatusHeader.svelte';
    import ConsentControl from '$lib/components/ConsentControl.svelte';
    import QuestList from '$lib/components/QuestList.svelte';

    let { data }: { data: PageData } = $props();

    // X subject narrowed once for reuse in the dashboard props.
    const x = $derived(data.subject?.kind === 'x' ? data.subject : null);

    // Distinct eligibility strip state (eligibility = consent + >=1 identity).
    const eligibility = $derived<EligibilityState>(
        data.eligible ? 'eligible' : !data.quest.consented ? 'consent' : 'one_step',
    );

    // Quest progress (shared by the header pips + the list counter). "Done" per
    // quest: follow attested, any wallet, share verified, email saved, ≥1 referral.
    const QUESTS_TOTAL = 5;
    const questsDone = $derived(
        (data.quest.followAttested ? 1 : 0) +
            (data.quest.walletAddress !== 'none' ? 1 : 0) +
            (data.quest.postVerified ? 1 : 0) +
            (data.quest.hasEmail ? 1 : 0) +
            (data.quest.referralCount > 0 ? 1 : 0),
    );

    // OAuth callback bounces failures back to `/?error=<code>`.
    const AUTH_ERROR_COPY: Record<string, string> = {
        oauth_denied: 'X sign-in was cancelled or denied. Please try again.',
        state_mismatch: 'Your sign-in session expired. Please try again.',
        state_expired: 'Your sign-in session expired. Please try again.',
        oauth_failed: "We couldn't complete X sign-in. Please try again.",
    };
    let dismissedError = $state(false);
    const authErrorMessage = $derived(
        data.authError && !dismissedError
            ? (AUTH_ERROR_COPY[data.authError] ?? 'Sign-in failed. Please try again.')
            : '',
    );

    let loggingOut = $state(false);
    async function handleLogout() {
        if (loggingOut) return;
        loggingOut = true;
        try {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (res.ok) await invalidateAll();
        } catch (err) {
            console.error('Logout failed:', err);
        } finally {
            loggingOut = false;
        }
    }

    // Subtle mount reveal, matching the landing page's entrance rhythm.
    let mounted = $state(false);
    onMount(() => {
        mounted = true;
    });
</script>

<svelte:head>
    <title>{brand.og.title}</title>
    <meta name="description" content={brand.og.description} />
</svelte:head>

<section
    class="relative z-30 mx-auto flex w-full max-w-xl flex-col items-center gap-10 px-6 pb-28 pt-16 sm:pt-24"
>
    {#if !x}
        <!-- ─── Pre-auth: marketing hero + X login ─────────────────────────── -->
        <header
            class="flex flex-col items-center gap-5 text-center transition-all duration-700 ease-out {mounted
                ? 'translate-y-0 opacity-100'
                : 'translate-y-2 opacity-0'}"
        >
            <p class="text-xs font-medium uppercase tracking-[0.2em] text-base-content/40">
                {brand.hero.eyebrow}
            </p>
            <h1
                class="text-4xl font-bold leading-[1.1] tracking-tighter text-base-content [text-wrap:balance] sm:text-5xl md:text-6xl"
            >
                {brand.hero.headlinePre}
                {brand.hero.headlinePost}
                <span class="text-primary">{brand.hero.headlineAccent}</span>.
            </h1>
            <p class="max-w-lg text-base leading-relaxed text-base-content/60 sm:text-lg">
                {brand.hero.sub}
            </p>
        </header>

        {#if authErrorMessage}
            <ZenAlert
                variant="error"
                dismissible
                ondismiss={() => (dismissedError = true)}
                class="w-full max-w-md"
            >
                {authErrorMessage}
            </ZenAlert>
        {/if}

        <div class="w-full max-w-md">
            <ZenCard variant="glass" radius="2xl" padding="lg" class="text-left">
                <div class="flex flex-col gap-5">
                    <div class="flex flex-col gap-2">
                        <h2 class="text-xl font-semibold tracking-tight text-base-content">
                            Sign in with X
                        </h2>
                        <p class="text-sm leading-relaxed text-base-content/60">
                            Sign in and you're on the list instantly — then earn points to move up.
                        </p>
                    </div>

                    {#if data.xConfigured}
                        <XLoginButton />
                    {:else}
                        <p
                            class="rounded-xl border border-base-content/10 bg-base-content/[0.03] px-4 py-3 text-sm text-base-content/50"
                        >
                            Sign-in is coming soon — check back shortly.
                        </p>
                    {/if}

                    <!-- PII-at-login consent notice (a notice, not a checkbox) -->
                    <p class="text-xs leading-relaxed text-base-content/45">
                        By continuing you agree to our
                        <a
                            href="/terms-and-conditions"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-base-content/70 underline underline-offset-2 transition-colors hover:text-primary"
                            >Terms</a
                        >
                        &amp;
                        <a
                            href="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-base-content/70 underline underline-offset-2 transition-colors hover:text-primary"
                            >Privacy</a
                        > — we store your X handle to run the queue.
                    </p>

                    <p class="text-xs leading-relaxed text-base-content/45">
                        We use your X account to check you're human and that you follow
                        <strong class="font-semibold text-base-content/70">@{data.brand.handle}</strong
                        >. No tweets, no DMs — ever.
                    </p>
                </div>
            </ZenCard>
        </div>
    {:else}
        <!-- ─── Post-auth: points dashboard (single max-w-md column) ────────── -->
        {#if authErrorMessage}
            <ZenAlert
                variant="error"
                dismissible
                ondismiss={() => (dismissedError = true)}
                class="w-full max-w-md"
            >
                {authErrorMessage}
            </ZenAlert>
        {/if}

        <div
            class="flex w-full max-w-md flex-col gap-4 transition-all duration-700 ease-out {mounted
                ? 'translate-y-0 opacity-100'
                : 'translate-y-2 opacity-0'}"
        >
            <StatusHeader
                points={data.standing?.points ?? 0}
                position={data.standing?.position ?? null}
                {eligibility}
                {questsDone}
                questsTotal={QUESTS_TOTAL}
                username={x.username}
                profileImageUrl={x.profile_image_url}
                onLogout={handleLogout}
                {loggingOut}
            />

            {#if !data.quest.consented}
                <ConsentControl />
            {/if}

            <QuestList
                brand={data.brand}
                followAttested={data.quest.followAttested}
                walletAddress={data.quest.walletAddress}
                postVerified={data.quest.postVerified}
                hasEmail={data.quest.hasEmail}
                consented={data.quest.consented}
                referralCode={data.referralCode ?? ''}
                referralLink={data.referralLink ?? ''}
                referralCount={data.quest.referralCount}
                {questsDone}
                questsTotal={QUESTS_TOTAL}
            />
        </div>
    {/if}
</section>
