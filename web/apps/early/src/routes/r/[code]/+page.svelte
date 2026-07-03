<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';

    let { data }: { data: { code: string; inviterHandle: string | null } } = $props();

    const OG_IMAGE = 'https://early.zarf.to/og.png';
    const DESCRIPTION =
        "You've been invited to Zarf — private ZK airdrops on Stellar. Follow, share, and claim your beta tester spot.";

    const ogUrl = $derived(`https://early.zarf.to/r/${data.code}`);
    const ogTitle = $derived(
        `${data.inviterHandle ? '@' + data.inviterHandle : 'A friend'} invited you to Zarf early access`,
    );
    const heading = $derived(
        data.inviterHandle ? `@${data.inviterHandle} invited you` : "You're invited",
    );

    // Crawlers don't run JS: they read the OG meta above and stop, so the shared
    // card renders with the invite framing. Humans get a brief beat to register
    // the invite, then land on the funnel — the first-touch referral cookie was
    // already set server-side in +page.server.ts, so '/' resolves the referrer.
    // Cleared on unmount so a fast back-nav can't fire a stale redirect.
    onMount(() => {
        const t = setTimeout(() => goto('/'), 1200);
        return () => clearTimeout(t);
    });
</script>

<svelte:head>
    <title>{ogTitle}</title>
    <meta name="description" content={DESCRIPTION} />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Zarf" />
    <meta property="og:url" content={ogUrl} />
    <meta property="og:title" content={ogTitle} />
    <meta property="og:description" content={DESCRIPTION} />
    <meta property="og:image" content={OG_IMAGE} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={ogTitle} />

    <!-- Twitter card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={ogTitle} />
    <meta name="twitter:description" content={DESCRIPTION} />
    <meta name="twitter:image" content={OG_IMAGE} />
</svelte:head>

<section
    class="relative flex min-h-[calc(100svh-9rem)] items-center justify-center px-6 py-16 font-sans"
>
    <ZenCard variant="glass" padding="lg" radius="2xl" class="max-w-md text-left">
        <p class="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Beta access · invite
        </p>

        <h1 class="mb-3 text-2xl font-bold leading-snug tracking-tight text-base-content sm:text-3xl">
            {heading}
        </h1>

        <p class="mb-8 text-sm leading-relaxed text-base-content/60">
            Private ZK airdrops on Stellar — claim your beta tester spot.
        </p>

        <a href="/" class="inline-block" aria-label="Get beta access">
            <ZenButton variant="primary" size="md">
                Get beta access →
            </ZenButton>
        </a>

        <p class="mt-6 text-xs font-medium tracking-wide text-base-content/40">
            Taking you to Zarf…
        </p>
    </ZenCard>
</section>
