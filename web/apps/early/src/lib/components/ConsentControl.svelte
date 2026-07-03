<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';

    // Standalone, one-time consent. Rendered only until consent is recorded — the
    // page hides this once data.quest.consented flips. The email/wallet quests
    // inline their OWN consent checkbox (sending consent:true with the identity),
    // so first consent wins whichever path the user takes; both write the same
    // consent_at.

    let checked = $state(false);
    let loading = $state(false);
    let errorMsg = $state('');

    const ERROR_COPY: Record<string, string> = {
        rate_limited: 'Too many attempts — please try again shortly.',
        unauthorized: 'Your session expired. Please sign in again.',
        bad_request: 'Something went wrong. Please try again.'
    };

    function mapError(code: string | undefined): string {
        return (code && ERROR_COPY[code]) || 'Something went wrong. Please try again.';
    }

    async function submit() {
        if (loading || !checked) return;
        loading = true;
        errorMsg = '';

        let res: Response;
        try {
            res = await fetch('/api/waitlist/consent', {
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

<ZenCard variant="glass" radius="2xl" padding="lg" class="text-left">
    <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
            <span class="font-mono text-[10px] uppercase tracking-widest text-base-content/45">
                One-time consent
            </span>
            <h2 class="text-lg font-semibold tracking-tight text-base-content">
                Make yourself airdrop-eligible
            </h2>
        </div>

        <label class="flex items-start gap-3">
            <span class="shrink-0 pt-0.5">
                <ZenCheckbox bind:checked disabled={loading} aria-label="Consent" />
            </span>
            <span class="text-sm leading-relaxed text-base-content/70">
                We already store your X handle to run the queue. I also consent to Zarf storing an
                email and/or wallet address to deliver my beta airdrop. We never DM you or ask for
                your secret key. See our
                <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-base-content underline underline-offset-2 transition-colors hover:text-primary"
                    >Privacy notice</a
                >
                and
                <a
                    href="/terms-and-conditions"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-base-content underline underline-offset-2 transition-colors hover:text-primary"
                    >Terms</a
                >.
            </span>
        </label>

        <ZenButton
            variant="primary"
            size="lg"
            class="w-full"
            loading={loading}
            disabled={!checked || loading}
            onclick={submit}
        >
            {loading ? 'Saving…' : 'I consent'}
        </ZenButton>

        {#if errorMsg}
            <ZenAlert variant="error">{errorMsg}</ZenAlert>
        {/if}
    </div>
</ZenCard>
