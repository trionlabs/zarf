<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import QuestCard from './QuestCard.svelte';
    import { POINTS } from '$lib/quests';

    interface Props {
        brand: { name: string; handle: string };
        // follow_attested_at present → the attest was recorded.
        done: boolean;
        recommended?: boolean;
        open?: boolean;
        ontoggle?: () => void;
    }

    let { brand, done, recommended = false, open = false, ontoggle }: Props = $props();

    let loading = $state(false);
    let errorMsg = $state('');

    // Friendly copy per stable error code from POST /api/waitlist/attest-follow.
    const ERROR_COPY: Record<string, string> = {
        rate_limited: 'Too many attempts — re-authenticate to retry',
        unauthorized: 'Your session expired. Please sign in again.',
        step_locked: 'Please complete the earlier steps first',
        bad_request: 'Something went wrong. Please try again.'
    };

    function mapError(code: string | undefined): string {
        return (code && ERROR_COPY[code]) || 'Something went wrong. Please try again.';
    }

    async function attestFollow() {
        if (loading) return;
        loading = true;
        errorMsg = '';

        let res: Response;
        try {
            res = await fetch('/api/waitlist/attest-follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
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

<!-- Honest copy: the sweep is async/manual, so we NEVER say "verified" here. -->
<QuestCard
    title="Follow on X"
    pointsLabel={`+${POINTS.follow}`}
    {done}
    doneLabel="Follow recorded — we'll confirm"
    {recommended}
    {open}
    {ontoggle}
>
    <div class="flex flex-col gap-3">
        <a
            href={`https://x.com/${brand.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            class="block w-full"
        >
            <ZenButton variant="secondary" size="lg" class="w-full">
                Follow @{brand.handle} on X ↗
            </ZenButton>
        </a>

        <ZenButton
            variant="primary"
            size="lg"
            class="w-full"
            loading={loading}
            onclick={attestFollow}
        >
            {loading ? 'Recording…' : `I followed @${brand.handle}`}
        </ZenButton>
    </div>

    {#if errorMsg}
        <ZenAlert variant="error">{errorMsg}</ZenAlert>
    {/if}
</QuestCard>
