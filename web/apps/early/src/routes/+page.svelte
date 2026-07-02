<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidateAll } from '$app/navigation';
    import { brand } from '$lib/brand';
    import type { PageData } from './$types';

    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';

    import Stepper from '$lib/components/Stepper.svelte';
    import XLoginButton from '$lib/components/XLoginButton.svelte';
    import FollowGate from '$lib/components/FollowGate.svelte';
    import PostGate from '$lib/components/PostGate.svelte';
    import WalletGate from '$lib/components/WalletGate.svelte';
    import QueueCard from '$lib/components/QueueCard.svelte';

    let { data }: { data: PageData } = $props();

    // X subject narrowed once for reuse in the derived step + card props.
    const x = $derived(data.subject?.kind === 'x' ? data.subject : null);

    // Server-enforced step derivation, mirrored for the UI:
    //   1 Login  (not X-authed)      → XLoginButton card
    //   2 Follow (!follow_attested_at)
    //   3 Share  (!post_verified_at)
    //   4 Wallet (!completed_at)
    //   5        → QueueCard (Stepper hides at this stage)
    const step = $derived.by(() => {
        if (!x) return 1;
        if (x.follow_attested_at == null) return 2;
        if (x.post_verified_at == null) return 3;
        if (x.completed_at == null) return 4;
        return 5;
    });

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
    <!-- Hero -->
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

    <!-- OAuth error surfaced from the callback redirect -->
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

    <!-- Progress indicator (hidden once queued) -->
    {#if step <= 4}
        <Stepper current={step as 1 | 2 | 3 | 4} />
    {/if}

    <!-- Authenticated identity chip for the mid-funnel steps -->
    {#if x && step >= 2 && step <= 4}
        <div
            class="flex w-full max-w-md items-center justify-between rounded-2xl border border-base-content/5 bg-base-content/[0.03] px-4 py-3"
        >
            <div class="flex items-center gap-3">
                {#if x.profile_image_url}
                    <img
                        src={x.profile_image_url}
                        alt=""
                        class="h-9 w-9 rounded-full ring-1 ring-base-content/15"
                    />
                {/if}
                <div class="flex flex-col text-left leading-tight">
                    <span class="font-mono text-[10px] uppercase tracking-wider text-base-content/40">
                        Signed in
                    </span>
                    <span class="text-sm font-semibold text-base-content">@{x.username}</span>
                </div>
            </div>
            <ZenButton variant="ghost" size="sm" onclick={handleLogout} disabled={loggingOut}>
                Sign out
            </ZenButton>
        </div>
    {/if}

    <!-- Current step card -->
    <div class="w-full max-w-md">
        {#if step === 1}
            <ZenCard variant="glass" radius="2xl" padding="lg" class="text-left">
                <div class="flex flex-col gap-5">
                    <div class="flex flex-col gap-2">
                        <h2 class="text-xl font-semibold tracking-tight text-base-content">
                            Sign in with X
                        </h2>
                        <p class="text-sm leading-relaxed text-base-content/60">
                            Start with your X account — it's how we keep the beta list
                            bot-free.
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

                    <p class="text-xs leading-relaxed text-base-content/45">
                        We use your X account to check you're human and that you follow
                        <strong class="font-semibold text-base-content/70">@{data.brand.handle}</strong
                        >. No tweets, no DMs — ever.
                    </p>
                </div>
            </ZenCard>
        {:else if step === 2}
            <FollowGate brand={data.brand} />
        {:else if step === 3}
            <PostGate referralCode={x?.referral_code ?? ''} />
        {:else if step === 4}
            <WalletGate />
        {:else}
            <QueueCard
                position={data.queue?.position ?? 0}
                total={data.queue?.total ?? 0}
                referralLink={data.referralLink ?? ''}
                referralCount={x?.referral_count ?? 0}
                username={x?.username ?? ''}
                profileImageUrl={x?.profile_image_url ?? null}
                onLogout={handleLogout}
            />
        {/if}
    </div>
</section>
