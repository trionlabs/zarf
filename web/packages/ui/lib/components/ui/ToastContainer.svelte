<script lang="ts">
    import { onDestroy } from 'svelte';
    import { toastStore, type Toast, type ToastType } from '../../stores/toastStore.svelte';
    import { fly } from 'svelte/transition';
    import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-svelte';

    // Icon Mapping
    const icons = {
        success: CheckCircle,
        error: AlertCircle,
        info: Info,
        warning: AlertTriangle,
    };

    const colors = {
        success: 'border-zen-success/20 bg-zen-success-muted text-zen-success',
        error: 'border-zen-error/20 bg-zen-error-muted text-zen-error',
        info: 'border-zen-info/20 bg-zen-info-muted text-zen-info',
        warning: 'border-zen-warning/20 bg-zen-warning-muted text-zen-warning',
    };

    // Per WAI-ARIA: role="alert" implies aria-live="assertive" (interrupts
    // screen reader speech). Use it only for errors. Non-critical toasts
    // use role="status" (implicit aria-live="polite"), which announces at
    // the next idle moment without interrupting.
    function roleFor(type: ToastType): 'alert' | 'status' {
        return type === 'error' ? 'alert' : 'status';
    }

    /*
     * Auto-dismiss timing lives here (not in the store) so the countdown
     * can be paused on hover/focus per WCAG 2.2.1 (Timing Adjustable).
     * `startedAt + remaining` is enough to resume from the paused point
     * — on pause we recompute remaining = remaining - (now - startedAt);
     * on resume we set a fresh timeout for the leftover time.
     */
    interface TimerState {
        timeoutId: ReturnType<typeof setTimeout> | null;
        startedAt: number;
        remaining: number;
    }
    const timers = new Map<string, TimerState>();

    function startTimer(toastId: string, durationMs: number) {
        if (durationMs <= 0) return;
        const timeoutId = setTimeout(() => {
            timers.delete(toastId);
            toastStore.remove(toastId);
        }, durationMs);
        timers.set(toastId, {
            timeoutId,
            startedAt: performance.now(),
            remaining: durationMs,
        });
    }

    function pauseTimer(toastId: string) {
        const state = timers.get(toastId);
        if (!state || state.timeoutId === null) return;
        clearTimeout(state.timeoutId);
        const elapsed = performance.now() - state.startedAt;
        timers.set(toastId, {
            timeoutId: null,
            startedAt: 0,
            remaining: Math.max(0, state.remaining - elapsed),
        });
    }

    function resumeTimer(toastId: string) {
        const state = timers.get(toastId);
        if (!state || state.timeoutId !== null) return;
        if (state.remaining <= 0) {
            timers.delete(toastId);
            toastStore.remove(toastId);
            return;
        }
        const timeoutId = setTimeout(() => {
            timers.delete(toastId);
            toastStore.remove(toastId);
        }, state.remaining);
        timers.set(toastId, {
            timeoutId,
            startedAt: performance.now(),
            remaining: state.remaining,
        });
    }

    // Bootstrap timers for new toasts and tear down timers for toasts
    // removed externally (e.g., via the dismiss button). Runs whenever
    // toastStore.toasts mutates.
    $effect(() => {
        const liveIds = new Set(toastStore.toasts.map((t) => t.id));
        for (const toast of toastStore.toasts) {
            if (!timers.has(toast.id)) {
                startTimer(toast.id, toast.duration ?? 4000);
            }
        }
        for (const id of Array.from(timers.keys())) {
            if (!liveIds.has(id)) {
                const state = timers.get(id);
                if (state?.timeoutId !== null && state?.timeoutId !== undefined) {
                    clearTimeout(state.timeoutId);
                }
                timers.delete(id);
            }
        }
    });

    onDestroy(() => {
        for (const state of timers.values()) {
            if (state.timeoutId !== null) clearTimeout(state.timeoutId);
        }
        timers.clear();
    });
</script>

{#if toastStore.toasts.length > 0}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 p-4">
        {#each toastStore.toasts as toast (toast.id)}
            {@const Icon = icons[toast.type]}

            <div
                class="
                flex items-start gap-3 p-4
                max-w-sm w-full
                rounded-xl border-[0.5px]
                shadow-lg backdrop-blur-md
                {colors[toast.type]}
            "
                transition:fly={{ y: 20, duration: 300 }}
                role={roleFor(toast.type)}
                onmouseenter={() => pauseTimer(toast.id)}
                onmouseleave={() => resumeTimer(toast.id)}
                onfocusin={() => pauseTimer(toast.id)}
                onfocusout={() => resumeTimer(toast.id)}
            >
                <div class="mt-0.5 shrink-0">
                    <Icon class="w-5 h-5" aria-hidden="true" />
                </div>

                <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium leading-tight block break-words">
                        {toast.message}
                    </span>
                </div>

                <!--
                Dismiss target sits at 32x32. WCAG 2.5.5 (AAA) asks for 44x44,
                but 2.5.8 (AA) accepts <24x24 only when surrounded by 24px of
                clearance from other targets. The toast has exactly one target
                (this dismiss button) so the spacing exception trivially holds;
                32x32 keeps the toast vertical rhythm intact while comfortably
                clearing both AA thresholds.
            -->
                <button
                    class="
                    shrink-0 inline-flex items-center justify-center
                    min-w-8 min-h-8 -mr-1 -mt-1
                    rounded-md opacity-60 hover:opacity-100
                    hover:bg-[var(--zen-fg)]/5
                    transition-opacity
                "
                    onclick={() => toastStore.remove(toast.id)}
                    aria-label="Close"
                >
                    <X class="w-4 h-4" aria-hidden="true" />
                </button>
            </div>
        {/each}
    </div>
{/if}
