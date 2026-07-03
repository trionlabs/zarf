<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import QuestCard from './QuestCard.svelte';
    import { POINTS } from '$lib/quests';

    interface Props {
        // email present → identity recorded (immutable — the ZK leaf).
        done: boolean;
        // consent_at present → hide the inline consent checkbox.
        consented: boolean;
        recommended?: boolean;
        open?: boolean;
        ontoggle?: () => void;
    }

    let { done, consented, recommended = false, open = false, ontoggle }: Props = $props();

    let email = $state('');
    let confirmEmail = $state('');
    // Inline consent only matters when the user hasn't consented yet.
    let consent = $state(false);
    let loading = $state(false);
    let errorMsg = $state('');

    // Double-entry: a typo becomes an UNRECOVERABLE ZK merkle leaf, so we force a
    // confirm and block submit on mismatch (copied from the retired WalletGate UX).
    const emailMatch = $derived(email.trim().length > 0 && email.trim() === confirmEmail.trim());
    const showEmailMismatch = $derived(confirmEmail.trim().length > 0 && !emailMatch);
    const consentOk = $derived(consented || consent);
    const canSubmit = $derived(emailMatch && consentOk && !loading);

    // Friendly copy per stable error code from POST /api/waitlist/email.
    const ERROR_COPY: Record<string, string> = {
        consent_required: 'Please tick consent so we can store your email.',
        email_taken: 'That email is already registered to another account',
        rate_limited: 'Too many attempts — try again tomorrow',
        bad_request: 'Please check your email and try again'
    };

    function mapError(code: string | undefined): string {
        return (code && ERROR_COPY[code]) || 'Something went wrong. Please try again.';
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        loading = true;
        errorMsg = '';

        let res: Response;
        try {
            res = await fetch('/api/waitlist/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send consent:true only when the user is consenting via this form;
                // first consent wins, so a redundant true on an already-consented
                // user is harmless.
                body: JSON.stringify({ email: email.trim(), ...(consented ? {} : { consent: true }) })
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

        // NEVER echo the raw email back — only the mapped, generic code copy.
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        errorMsg = mapError(body.error);
        loading = false;
    }
</script>

<QuestCard
    title="Add your email"
    pointsLabel={`+${POINTS.email}`}
    {done}
    doneLabel="Email added"
    {recommended}
    {open}
    {ontoggle}
>
    <form class="flex flex-col gap-4" onsubmit={submit}>
        <p class="-mb-1 text-xs text-base-content/45">Locked once saved — double-check it.</p>
        <ZenInput
            id="quest-email"
            label="Email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            bind:value={email}
            disabled={loading}
        />

        <ZenInput
            id="quest-email-confirm"
            label="Confirm email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            bind:value={confirmEmail}
            disabled={loading}
            error={showEmailMismatch ? "Emails don't match" : null}
        />

        {#if !consented}
            <label class="flex items-start gap-3 pt-1">
                <span class="shrink-0 pt-0.5">
                    <ZenCheckbox bind:checked={consent} disabled={loading} aria-label="Consent" />
                </span>
                <span class="text-xs leading-relaxed text-base-content/60">
                    I consent to Zarf storing my email to deliver my beta airdrop. See our
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
        {/if}

        <ZenButton
            type="submit"
            variant="primary"
            size="lg"
            class="w-full"
            loading={loading}
            disabled={!canSubmit}
        >
            {loading ? 'Saving…' : 'Save email'}
        </ZenButton>
    </form>

    {#if errorMsg}
        <ZenAlert variant="error">{errorMsg}</ZenAlert>
    {/if}
</QuestCard>
