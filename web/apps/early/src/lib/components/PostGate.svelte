<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';

    interface Props {
        // The user's own referral code — used to build their personal share link
        // so the post they verify carries their /r/ URL (the campaign-link rule).
        referralCode: string;
        // Share is OPTIONAL — skipping advances to the wallet step without posting.
        onSkip?: () => void;
    }

    let { referralCode, onSkip }: Props = $props();

    // Suggested post copy (approved). The t.co-wrapped URL counts as 23 chars;
    // this body is ~127 chars, so the full post lands well under 280.
    // Verification passes on the appended early.zarf.to link (host-substring
    // rule); #LandedOnZarf is also accepted by verify-post as a fallback if a
    // user strips the link before posting.
    const SHARE_TEXT =
        'Airdrops, but with privacy built in.\n\n' +
        'I just joined the @zarfto beta for private ZK airdrops on Stellar.\n\n' +
        'Claim an early spot 🛬';

    const referralLink = $derived(`https://early.zarf.to/r/${referralCode}`);
    const intentHref = $derived(
        `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}` +
            `&url=${encodeURIComponent(referralLink)}`,
    );

    let url = $state('');
    let loading = $state(false);
    let success = $state(false);
    let errorMsg = $state('');

    // Friendly copy per stable error code from POST /api/waitlist/verify-post.
    const ERROR_COPY: Record<string, string> = {
        post_not_found: "We couldn't find that post — is it public?",
        post_wrong_author: "That post isn't from your account",
        post_missing_link: 'Your post needs your early.zarf.to link (or #LandedOnZarf)',
        post_already_used: 'That post has already been used',
        // Transient — X is unreachable, not the user's fault.
        oembed_unavailable: 'X is unreachable right now — try again in a minute',
        rate_limited: 'Too many attempts — try again tomorrow',
        step_locked: 'Please complete the earlier steps first',
        bad_request: "That doesn't look like a valid post URL",
    };

    function mapError(code: string | undefined): string {
        return (code && ERROR_COPY[code]) || 'Something went wrong. Please try again.';
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (loading || success || url.trim() === '') return;
        loading = true;
        errorMsg = '';

        let res: Response;
        try {
            // Relative URL → browser attaches Origin → passes the CSRF origin guard.
            res = await fetch('/api/waitlist/verify-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
        } catch {
            errorMsg = 'Something went wrong. Please try again.';
            loading = false;
            return;
        }

        if (res.ok) {
            success = true;
            await invalidateAll();
            return;
        }

        const body = (await res.json().catch(() => ({}))) as { error?: string };
        errorMsg = mapError(body.error);
        loading = false;
    }
</script>

<ZenCard variant="glass" radius="2xl" padding="lg" class="text-left">
    <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold tracking-tight text-base-content">
                Share your landing
            </h2>
            <p class="text-sm leading-relaxed text-base-content/60">
                Optional — post about Zarf with your personal invite link to bring friends into the
                beta, then paste the URL to verify. Or skip and secure your spot now.
            </p>
        </div>

        <a href={intentHref} target="_blank" rel="noopener noreferrer" class="block w-full">
            <ZenButton variant="secondary" size="lg" class="w-full">Share on X ↗</ZenButton>
        </a>

        <form class="flex flex-col gap-4" onsubmit={submit}>
            <ZenInput
                id="post-url"
                label="Your post URL"
                type="url"
                inputmode="url"
                required
                placeholder="https://x.com/you/status/…"
                bind:value={url}
                class="font-mono"
                disabled={loading || success}
                aria-invalid={errorMsg ? 'true' : undefined}
            />

            <ZenButton
                type="submit"
                variant="primary"
                size="lg"
                class="w-full"
                loading={loading}
                disabled={success || url.trim() === ''}
            >
                {#if success}
                    Verified ✓
                {:else}
                    Verify my post
                {/if}
            </ZenButton>
        </form>

        {#if errorMsg}
            <ZenAlert variant="error">{errorMsg}</ZenAlert>
        {/if}

        {#if onSkip}
            <button
                type="button"
                onclick={onSkip}
                disabled={loading || success}
                class="mx-auto text-xs font-medium text-base-content/45 underline-offset-4 transition-colors hover:text-base-content/70 hover:underline disabled:opacity-50"
            >
                Skip for now →
            </button>
        {/if}
    </div>
</ZenCard>
