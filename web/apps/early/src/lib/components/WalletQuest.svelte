<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import QuestCard from './QuestCard.svelte';
    import { POINTS, WALLET_VERIFY_BONUS, type WalletState } from '$lib/quests';

    interface Props {
        // 'verified' | 'pasted' | 'none' (server flags).
        walletAddress: WalletState;
        // consent_at present → skip the inline consent checkbox.
        consented: boolean;
        recommended?: boolean;
        tag?: string;
        open?: boolean;
        ontoggle?: () => void;
    }

    let { walletAddress, consented, recommended = false, tag, open = false, ontoggle }: Props =
        $props();

    // Live shape check only (SSR-safe, SDK-free). The server re-validates the
    // StrKey checksum before persisting — this is purely typing UX.
    const ADDRESS_RE = /^G[A-Z2-7]{55}$/;

    let address = $state('');
    let consent = $state(false); // inline consent (only when !consented)
    let signing = $state(false); // connect + sign in flight
    let pasteLoading = $state(false);
    let pasteMode = $state(false); // reveal the paste fallback
    let freighterMissing = $state(false);
    let errorMsg = $state('');

    const addressValid = $derived(ADDRESS_RE.test(address.trim()));
    const showAddressHint = $derived(address.trim().length > 0 && !addressValid);
    // Consent must be satisfied before EITHER path can write an identity.
    const consentOk = $derived(consented || consent);
    const busy = $derived(signing || pasteLoading);

    // Verify-flow error copy (wallet-challenge + wallet-verify share codes).
    const VERIFY_ERROR_COPY: Record<string, string> = {
        consent_required: 'Please tick consent so we can store your wallet.',
        challenge_expired: 'Challenge expired — tap Connect & Sign again.',
        invalid_signature: "That signature didn't check out. Please try again.",
        wallet_taken: 'That wallet is already registered to another account',
        invalid_wallet: "That doesn't look like a valid Stellar address",
        rate_limited: 'Too many attempts — try again tomorrow',
        bad_request: 'Something went wrong. Please try again.'
    };
    // Paste-flow error copy (POST /api/waitlist/wallet).
    const PASTE_ERROR_COPY: Record<string, string> = {
        consent_required: 'Please tick consent so we can store your wallet.',
        invalid_wallet: "That doesn't look like a valid Stellar address",
        wallet_taken: 'That wallet is already registered to another account',
        rate_limited: 'Too many attempts — try again tomorrow',
        bad_request: 'Please check the address and try again'
    };

    function map(copy: Record<string, string>, code: string | undefined): string {
        return (code && copy[code]) || 'Something went wrong. Please try again.';
    }

    async function errCode(res: Response): Promise<string | undefined> {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return body.error;
    }

    // Primary path: connect Freighter → challenge → sign RAW → verify.
    async function connectSign() {
        if (busy) return;
        if (!consentOk) return;
        signing = true;
        errorMsg = '';
        freighterMissing = false;

        try {
            const { connectWalletAddress, signWalletMessage, isFreighterMissingError, isUserRejectionError } =
                await import('$lib/wallet');

            // 1. Connect
            let addr: string;
            try {
                addr = await connectWalletAddress();
            } catch (e) {
                if (isFreighterMissingError(e)) {
                    freighterMissing = true;
                    pasteMode = true;
                    errorMsg = 'Freighter not detected — install it, or paste your address below.';
                    return;
                }
                if (isUserRejectionError(e)) {
                    errorMsg = 'Connection cancelled in Freighter.';
                    return;
                }
                throw e;
            }

            // 2. Challenge (server binds the nonce to this address + X account)
            const chalRes = await fetch('/api/waitlist/wallet-challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: addr })
            });
            if (!chalRes.ok) {
                errorMsg = map(VERIFY_ERROR_COPY, await errCode(chalRes));
                return;
            }
            const { nonce, message } = (await chalRes.json()) as { nonce: string; message: string };

            // 3. Sign the message RAW (Freighter adds the SEP-53 prefix internally)
            let signature: string;
            try {
                signature = await signWalletMessage(message, addr);
            } catch (e) {
                if (isUserRejectionError(e)) {
                    errorMsg = 'Signature cancelled in Freighter.';
                    return;
                }
                throw e;
            }

            // 4. Verify (consent:true only when consenting via this path)
            const verifyRes = await fetch('/api/waitlist/wallet-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nonce,
                    address: addr,
                    signature,
                    ...(consented ? {} : { consent: true })
                })
            });
            if (verifyRes.ok) {
                await invalidateAll();
                return;
            }
            errorMsg = map(VERIFY_ERROR_COPY, await errCode(verifyRes));
        } catch {
            errorMsg = 'Something went wrong. Please try again.';
        } finally {
            signing = false;
        }
    }

    // Fallback path: paste a G-address (no ownership proof).
    async function submitPaste(e: SubmitEvent) {
        e.preventDefault();
        if (busy || !addressValid || !consentOk) return;
        pasteLoading = true;
        errorMsg = '';

        let res: Response;
        try {
            res = await fetch('/api/waitlist/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address.trim(),
                    ...(consented ? {} : { consent: true })
                })
            });
        } catch {
            errorMsg = 'Something went wrong. Please try again.';
            pasteLoading = false;
            return;
        }

        if (res.ok) {
            await invalidateAll();
            return;
        }
        // NEVER echo the raw address back — only the mapped code copy.
        errorMsg = map(PASTE_ERROR_COPY, await errCode(res));
        pasteLoading = false;
    }
</script>

<QuestCard
    title="Connect wallet"
    pointsLabel={walletAddress === 'pasted'
        ? `+${WALLET_VERIFY_BONUS} more`
        : `+${POINTS.walletVerified}`}
    done={walletAddress === 'verified'}
    doneLabel="Wallet connected & verified"
    earnedLabel={`+${POINTS.walletVerified}`}
    {recommended}
    {tag}
    {open}
    {ontoggle}
>
    {#if walletAddress === 'pasted'}
        <span
            class="self-start rounded-full bg-zen-warning-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zen-warning-content"
        >
            Saved · unverified — sign to confirm
        </span>
    {/if}

    <!-- Inline consent — first consent wins across quests -->
    {#if !consented}
        <label class="flex items-start gap-3">
            <span class="shrink-0 pt-0.5">
                <ZenCheckbox bind:checked={consent} disabled={busy} aria-label="Consent" />
            </span>
            <span class="text-xs leading-relaxed text-base-content/60">
                I consent to Zarf storing my wallet address to deliver my beta airdrop. We never ask
                for your secret key. See our
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
        variant="primary"
        size="lg"
        class="w-full"
        loading={signing}
        disabled={busy || !consentOk}
        onclick={connectSign}
    >
        {signing ? 'Waiting for Freighter…' : 'Connect & Sign'}
    </ZenButton>

    {#if !freighterMissing}
        <p class="-mt-1 text-center text-[11px] text-base-content/40">No transaction · no fees</p>
    {/if}

    {#if freighterMissing}
        <ZenAlert variant="info">
            No Freighter extension found.
            <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noopener noreferrer"
                class="font-medium underline underline-offset-2">Install Freighter</a
            >, or paste your address below.
        </ZenAlert>
    {/if}

    <!-- Paste fallback -->
    {#if pasteMode}
        <form class="flex flex-col gap-3 border-t border-base-content/5 pt-4" onsubmit={submitPaste}>
            <ZenInput
                id="wallet-address"
                label="Stellar address"
                type="text"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                placeholder="G…"
                bind:value={address}
                class="font-mono tracking-[0.02em]"
                disabled={busy}
                hint="Starts with G, 56 characters"
                error={showAddressHint ? 'Starts with G, 56 characters' : null}
            />
            <ZenButton
                type="submit"
                variant="secondary"
                size="lg"
                class="w-full"
                loading={pasteLoading}
                disabled={busy || !addressValid || !consentOk}
            >
                {pasteLoading ? 'Saving…' : `Save address (+${POINTS.walletPasted})`}
            </ZenButton>
        </form>
    {:else}
        <button
            type="button"
            onclick={() => (pasteMode = true)}
            disabled={busy}
            class="mx-auto text-xs font-medium text-base-content/45 underline-offset-4 transition-colors hover:text-base-content/70 hover:underline disabled:opacity-50"
        >
            or paste your address instead →
        </button>
    {/if}

    {#if errorMsg}
        <ZenAlert variant="error">{errorMsg}</ZenAlert>
    {/if}
</QuestCard>
