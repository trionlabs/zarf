<script lang="ts">
    import { goto } from '$app/navigation';
    import { ArrowRight, Mail, Wallet } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
</script>

<svelte:head>
    <title>Zarf Create</title>
    <meta
        name="description"
        content="Create email/ZK vesting distributions or wallet airdrops on Stellar."
    />
</svelte:head>

<div class="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center gap-8 px-4 py-10">
    <div class="space-y-3 text-center">
        <h1 class="text-3xl font-semibold tracking-tight text-zen-fg sm:text-4xl">
            Create a token campaign
        </h1>
        <p class="mx-auto max-w-2xl text-sm text-zen-fg-muted">
            Choose how recipients prove eligibility. Both flows deploy through the same campaign
            factory.
        </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
        <ZenCard class="flex flex-col gap-5 p-6">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-zen-primary/10">
                <Mail class="h-5 w-5 text-zen-primary" />
            </div>
            <div class="space-y-2">
                <h2 class="text-lg font-semibold text-zen-fg">Email + ZK</h2>
                <p class="text-sm text-zen-fg-muted">
                    Upload email recipients, set unlock epochs, and let recipients claim privately
                    with a Google-bound proof.
                </p>
            </div>
            <ZenButton variant="primary" onclick={() => goto('/wizard/step-0')}>
                Create email campaign <ArrowRight class="ml-1 h-4 w-4" />
            </ZenButton>
        </ZenCard>

        <ZenCard class="flex flex-col gap-5 p-6">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-zen-fg/5">
                <Wallet class="h-5 w-5 text-zen-fg" />
            </div>
            <div class="space-y-2">
                <h2 class="text-lg font-semibold text-zen-fg">Wallet Airdrop</h2>
                <p class="text-sm text-zen-fg-muted">
                    Upload wallet recipients, set an optional deadline, and publish a direct wallet
                    claim list.
                </p>
            </div>
            <ZenButton variant="secondary" onclick={() => goto('/airdrop/wizard/step-0')}>
                Create wallet campaign <ArrowRight class="ml-1 h-4 w-4" />
            </ZenButton>
        </ZenCard>
    </div>
</div>
