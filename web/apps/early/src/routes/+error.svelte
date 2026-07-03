<script lang="ts">
    import { page } from '$app/stores';
</script>

<svelte:head>
    <title>{$page.status} — Zarf</title>
</svelte:head>

<section class="mx-auto flex min-h-[60vh] w-full max-w-prose flex-col items-center justify-center px-6 text-center">
    <p class="font-mono text-xs uppercase tracking-widest text-primary">Zarf early access</p>
    <h1 class="mt-3 text-4xl font-bold tracking-tight text-base-content">{$page.status}</h1>
    <p class="mt-3 text-base-content/60">
        {$page.error?.message ?? 'Something went wrong.'}
    </p>
    <a
        href="/"
        class="mt-8 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-content transition hover:brightness-95"
    >
        Back to early access
    </a>
</section>
