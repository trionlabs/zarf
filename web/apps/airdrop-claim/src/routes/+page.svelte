<script lang="ts">
    import { page } from '$app/state';

    // T1 scaffold placeholder. The single-screen claim state machine
    // (load claim-list → connect wallet → verify proof → claim) lands in
    // T5/T6; T3/T4 add the load/verify service and the claim store.
    const airdrop = $derived(page.url.searchParams.get('a') ?? '');
    const cid = $derived(page.url.searchParams.get('cid') ?? '');
    const hasLink = $derived(airdrop.length > 0 && cid.length > 0);
</script>

<svelte:head>
    <title>Claim your airdrop — Zarf</title>
</svelte:head>

<main id="main" class="mx-auto max-w-xl py-16 text-center">
    <h1 class="text-2xl font-semibold tracking-tight text-zen-fg">Claim your airdrop</h1>
    <p class="mt-3 text-sm text-zen-fg-muted">
        {#if hasLink}
            Loading distribution…
        {:else}
            Open the claim link you were given to check your allocation.
        {/if}
    </p>
</main>
