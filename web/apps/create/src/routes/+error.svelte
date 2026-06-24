<script lang="ts">
    import { page } from '$app/state';
    import { AlertTriangle, Home } from 'lucide-svelte';

    const status = $derived(page.status);
    const isNotFound = $derived(status === 404);
    const title = $derived(isNotFound ? 'Page not found' : 'Something went wrong');
    const help = $derived(
        isNotFound
            ? "The page you're looking for doesn't exist or has moved."
            : 'An unexpected error occurred. Try refreshing — if it persists, jump back to the wizard.',
    );
    const message = $derived(page.error?.message ?? '');
</script>

<svelte:head>
    <title>{status} · {title}</title>
</svelte:head>

<section class="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-6">
    <div class="relative flex flex-col items-center justify-center group">
        <!-- Ambient Blur Glow -->
        <div
            class="absolute w-24 h-24 rounded-full bg-zen-error-muted/30 blur-2xl opacity-60 group-hover:opacity-80 transition-colors duration-500 animate-pulse-glow"
        ></div>

        <!-- Yüzen Dış Halka (Floating Outer Ring) -->
        <div
            class="w-20 h-20 rounded-full border border-zen-border flex items-center justify-center relative transition-all duration-500 group-hover:scale-105 group-hover:border-zen-fg/20 animate-float mb-4"
        >
            <!-- İç İkon Yuvası (Inner Glassmorphic Well) -->
            <div
                class="w-14 h-14 rounded-full flex items-center justify-center shadow-sm bg-zen-bg-elevated/80 backdrop-blur-md border border-zen-border-subtle transition-colors duration-300 group-hover:bg-zen-bg-elevated"
            >
                <AlertTriangle
                    class="w-6 h-6 text-zen-error transition-transform duration-300 group-hover:scale-110"
                />
            </div>

            <!-- Küçük Tasarım Detayı (Accent Dot) -->
            <span
                class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-zen-error border border-zen-bg animate-pulse"
            ></span>
        </div>
        <span class="text-xs font-mono uppercase tracking-widest text-zen-fg-muted"
            >Error {status}</span
        >
    </div>

    <h1 class="text-3xl font-semibold text-zen-fg">{title}</h1>

    <p class="max-w-md text-sm text-zen-fg-muted">{help}</p>

    {#if message && !isNotFound}
        <pre
            class="max-w-md text-xs font-mono text-zen-fg-faint bg-zen-bg-sunken rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{message}</pre>
    {/if}

    <div class="flex flex-wrap items-center justify-center gap-3">
        <a
            href="/wizard/step-0"
            class="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-full bg-zen-btn-primary-bg text-zen-btn-primary-text hover:bg-zen-btn-primary-bg-hover transition-colors"
        >
            <Home class="w-4 h-4" aria-hidden="true" />
            Start a new distribution
        </a>
        <a
            href="/distributions"
            class="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-full bg-zen-btn-secondary-bg text-zen-btn-secondary-text ring-1 ring-inset ring-zen-btn-secondary-border hover:bg-zen-btn-secondary-bg-hover transition-colors"
        >
            View distributions
        </a>
    </div>
</section>

<style>
    @keyframes float {
        0%,
        100% {
            transform: translateY(0px);
        }
        50% {
            transform: translateY(-5px);
        }
    }

    @keyframes pulse-glow {
        0%,
        100% {
            opacity: 0.4;
            transform: scale(0.92);
        }
        50% {
            opacity: 0.7;
            transform: scale(1.08);
        }
    }

    .animate-float {
        animation: float 4s ease-in-out infinite;
    }

    .animate-pulse-glow {
        animation: pulse-glow 3s ease-in-out infinite;
    }
</style>
