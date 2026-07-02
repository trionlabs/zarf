<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';

    // Live shape check only (SSR-safe, SDK-free). The server re-validates the
    // StrKey checksum before persisting — this is purely for typing UX.
    const ADDRESS_RE = /^G[A-Z2-7]{55}$/;

    let address = $state('');
    let email = $state('');
    let confirmEmail = $state('');
    let consent = $state(false);
    let loading = $state(false);
    let errorMsg = $state('');

    const addressValid = $derived(ADDRESS_RE.test(address.trim()));
    const showAddressHint = $derived(address.trim().length > 0 && !addressValid);
    const emailMatch = $derived(email.trim().length > 0 && email.trim() === confirmEmail.trim());
    const showEmailMismatch = $derived(confirmEmail.trim().length > 0 && !emailMatch);
    const canSubmit = $derived(
        addressValid && email.trim().length > 0 && emailMatch && consent && !loading,
    );

    // Friendly copy per stable error code from POST /api/waitlist/complete.
    const ERROR_COPY: Record<string, string> = {
        invalid_wallet: "That doesn't look like a valid Stellar address",
        email_taken: 'That email is already registered to another account',
        wallet_taken: 'That wallet is already registered to another account',
        rate_limited: 'Too many attempts — try again tomorrow',
        step_locked: 'Please complete the earlier steps first',
        bad_request: 'Please check your details and try again',
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
            res = await fetch('/api/waitlist/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address.trim(),
                    email: email.trim(),
                    consent: true,
                }),
            });
        } catch {
            errorMsg = 'Something went wrong. Please try again.';
            loading = false;
            return;
        }

        if (res.ok) {
            // On success the server returns { position, total, referral_* }; the
            // page re-derives the completed state and renders QueueCard.
            await invalidateAll();
            return;
        }

        // NEVER echo the raw address back — only the mapped, generic code copy.
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        errorMsg = mapError(body.error);
        loading = false;
    }
</script>

<ZenCard variant="glass" radius="2xl" padding="lg" class="text-left">
    <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold tracking-tight text-base-content">Claim your spot</h2>
            <p class="text-sm leading-relaxed text-base-content/60">
                Where should your beta airdrop land? Add your Stellar address and the email we'll use
                to reach you.
            </p>
        </div>

        <form class="flex flex-col gap-4" onsubmit={submit}>
            <ZenInput
                id="stellar-address"
                label="Stellar address"
                type="text"
                required
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                placeholder="G…"
                bind:value={address}
                class="font-mono tracking-[0.02em]"
                disabled={loading}
                hint="Starts with G, 56 characters"
                error={showAddressHint ? 'Starts with G, 56 characters' : null}
            />

            <ZenInput
                id="wallet-email"
                label="Email"
                type="email"
                required
                autocomplete="email"
                placeholder="you@example.com"
                bind:value={email}
                disabled={loading}
            />

            <ZenInput
                id="wallet-email-confirm"
                label="Confirm email"
                type="email"
                required
                autocomplete="email"
                placeholder="you@example.com"
                bind:value={confirmEmail}
                disabled={loading}
                error={showEmailMismatch ? "Emails don't match" : null}
            />

            <div class="flex items-start gap-3 pt-1">
                <span class="shrink-0 pt-0.5">
                    <ZenCheckbox bind:checked={consent} disabled={loading} aria-label="Consent" />
                </span>
                <p class="text-xs leading-relaxed text-base-content/60">
                    I agree that Zarf stores my X handle, wallet address and email to deliver beta
                    access. We never DM you or ask for your secret key. See our
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
                </p>
            </div>

            <ZenButton
                type="submit"
                variant="primary"
                size="lg"
                class="w-full"
                loading={loading}
                disabled={!canSubmit}
            >
                {loading ? 'Claiming…' : 'Claim my spot'}
            </ZenButton>
        </form>

        {#if errorMsg}
            <ZenAlert variant="error">{errorMsg}</ZenAlert>
        {/if}
    </div>
</ZenCard>
