<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';

    interface Props {
        // Runtime brand values from load data (BRAND_NAME / BRAND_HANDLE → env →
        // page load → here).
        brand: { name: string; handle: string };
    }

    let { brand }: Props = $props();

    let loading = $state(false);
    let errorMsg = $state('');

    // Friendly copy per stable error code from POST /api/waitlist/attest-follow.
    const ERROR_COPY: Record<string, string> = {
        rate_limited: 'Too many attempts — re-authenticate to retry',
        unauthorized: 'Your session expired. Please sign in again.',
        step_locked: 'Please complete the earlier steps first',
        bad_request: 'Something went wrong. Please try again.',
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
                body: JSON.stringify({}),
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
    <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold tracking-tight text-base-content">
                Follow @{brand.handle}
            </h2>
            <p class="text-sm leading-relaxed text-base-content/60">
                To keep the waitlist high-integrity, we verify that you follow {brand.name} on X.
            </p>
            <p class="font-mono text-xs leading-snug text-base-content/45">
                We only read your public profile — we never post for you.
            </p>
        </div>

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
                {loading ? 'Verifying…' : `I followed @${brand.handle}`}
            </ZenButton>
        </div>

        {#if errorMsg}
            <ZenAlert variant="error">{errorMsg}</ZenAlert>
        {/if}
    </div>
</ZenCard>
