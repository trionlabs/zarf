<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import QuestCard from './QuestCard.svelte';
    import { POINTS } from '$lib/quests';

    interface Props {
        // The user's own referral code — the intent appends their /r/ link so the
        // verified post carries their invite (host-substring verify rule).
        referralCode: string;
        // post_verified_at present → share verified via oEmbed.
        done: boolean;
        recommended?: boolean;
        open?: boolean;
        ontoggle?: () => void;
    }

    let { referralCode, done, recommended = false, open = false, ontoggle }: Props = $props();

    // Approved suggested copy (mirrors the retired PostGate). The personal /r/
    // link is appended by X via the intent `url` param (NOT inlined) so each user
    // shares their OWN referral link.
    const SHARE_TEXT =
        'Airdrops, but with privacy built in.\n\n' +
        'I just joined the @zarfto beta for private ZK airdrops on @StellarOrg ✨.\n\n' +
        'Claim an early spot 🛬';

    const referralLink = $derived(`https://early.zarf.to/r/${referralCode}`);
    const intentHref = $derived(
        `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}` +
            `&url=${encodeURIComponent(referralLink)}`
    );

    let url = $state('');
    let loading = $state(false);
    let errorMsg = $state('');

    // Friendly copy per stable error code from POST /api/waitlist/verify-post.
    const ERROR_COPY: Record<string, string> = {
        post_not_found: "We couldn't find that post — is it public?",
        post_wrong_author: "That post isn't from your account",
        post_missing_link: 'Your post needs your early.zarf.to link (or #LandedOnZarf)',
        post_already_used: 'That post has already been used',
        oembed_unavailable: 'X is unreachable right now — try again in a minute',
        rate_limited: 'Too many attempts — try again tomorrow',
        step_locked: 'Please complete the earlier steps first',
        bad_request: "That doesn't look like a valid post URL"
    };

    function mapError(code: string | undefined): string {
        return (code && ERROR_COPY[code]) || 'Something went wrong. Please try again.';
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (loading || url.trim() === '') return;
        loading = true;
        errorMsg = '';

        let res: Response;
        try {
            res = await fetch('/api/waitlist/verify-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
        } catch {
            errorMsg = 'Something went wrong. Please try again.';
            loading = false;
            return;
        }

        if (res.ok) {
            await invalidateAll();
            return;
        }

        const body = (await res.json().catch(() => ({}))) as { error?: string };
        errorMsg = mapError(body.error);
        loading = false;
    }
</script>

<QuestCard
    title="Share on X"
    pointsLabel={`+${POINTS.post}`}
    {done}
    doneLabel="Share verified"
    {recommended}
    {open}
    {ontoggle}
>
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
            disabled={loading}
            aria-invalid={errorMsg ? 'true' : undefined}
        />

        <ZenButton
            type="submit"
            variant="primary"
            size="lg"
            class="w-full"
            loading={loading}
            disabled={url.trim() === ''}
        >
            {loading ? 'Verifying…' : 'Verify my post'}
        </ZenButton>
    </form>

    {#if errorMsg}
        <ZenAlert variant="error">{errorMsg}</ZenAlert>
    {/if}
</QuestCard>
