<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData } from './$types';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';

    let { form }: { form: ActionData } = $props();

    let submitting = $state(false);
</script>

<svelte:head>
    <title>Admin login</title>
    <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<section
    class="relative flex min-h-[calc(100svh-9rem)] items-center justify-center px-6 py-16 font-sans"
>
    <ZenCard variant="glass" padding="lg" radius="2xl" class="max-w-sm text-left">
        <p class="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-primary">Admin</p>

        <h1 class="mb-2 text-2xl font-bold tracking-tight text-base-content">Sign in</h1>

        <p class="mb-6 text-sm leading-relaxed text-base-content/60">
            Enter the admin key to manage the waitlist.
        </p>

        <form
            method="POST"
            class="flex flex-col gap-4"
            use:enhance={() => {
                submitting = true;
                return async ({ update }) => {
                    await update();
                    submitting = false;
                };
            }}
        >
            <ZenInput
                type="password"
                name="key"
                label="Admin key"
                placeholder="Enter admin key"
                required
                autocomplete="off"
                disabled={submitting}
                error={form?.error ?? null}
            />

            <ZenButton
                type="submit"
                variant="primary"
                size="md"
                loading={submitting}
                disabled={submitting}
                class="w-full"
            >
                {submitting ? 'Signing in…' : 'Sign in'}
            </ZenButton>
        </form>
    </ZenCard>
</section>
