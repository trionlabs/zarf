<script lang="ts">
    import { page } from "$app/state";
    import { AlertTriangle, Home } from "lucide-svelte";
    import ZarfLogo from "@zarf/ui/components/brand/ZarfLogo.svelte";

    const status = $derived(page.status);
    const isNotFound = $derived(status === 404);
    const title = $derived(isNotFound ? "Page not found" : "Something went wrong");
    const help = $derived(
        isNotFound
            ? "The page you're looking for doesn't exist or has moved."
            : "An unexpected error occurred. Try refreshing — if it persists, head back to zarf.to.",
    );
    const message = $derived(page.error?.message ?? "");
</script>

<svelte:head>
    <title>{status} · {title}</title>
</svelte:head>

<section
    class="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-6"
>
    <a href="/" class="opacity-80 hover:opacity-100 transition-opacity">
        <ZarfLogo />
    </a>

    <div class="flex items-center gap-3 text-zen-fg-muted mt-4">
        <AlertTriangle class="w-5 h-5" aria-hidden="true" />
        <span class="text-xs font-mono uppercase tracking-widest"
            >Error {status}</span
        >
    </div>

    <h1 class="text-3xl font-semibold text-zen-fg">{title}</h1>

    <p class="max-w-md text-sm text-zen-fg-muted">{help}</p>

    {#if message && !isNotFound}
        <pre
            class="max-w-md text-xs font-mono text-zen-fg-faint bg-zen-bg-sunken rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{message}</pre>
    {/if}

    <a
        href="/"
        class="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-full bg-zen-btn-primary-bg text-zen-btn-primary-text hover:bg-zen-btn-primary-bg-hover transition-colors"
    >
        <Home class="w-4 h-4" aria-hidden="true" />
        Back to home
    </a>
</section>
