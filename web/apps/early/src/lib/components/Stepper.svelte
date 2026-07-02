<script lang="ts">
    // 4-dot funnel progress. `current` is the active step (1..4). Steps before it
    // are "done", the active one is "current", later ones are "upcoming". Purely
    // presentational — step derivation lives in the page.
    interface Props {
        current: 1 | 2 | 3 | 4;
    }

    let { current }: Props = $props();

    const steps = [
        { n: 1, label: 'Login' },
        { n: 2, label: 'Follow' },
        { n: 3, label: 'Share' },
        { n: 4, label: 'Wallet' },
    ] as const;

    function stateOf(n: number): 'done' | 'current' | 'upcoming' {
        if (n < current) return 'done';
        if (n === current) return 'current';
        return 'upcoming';
    }

    function dotClass(n: number): string {
        const s = stateOf(n);
        if (s === 'done') return 'bg-primary border-primary text-primary-content';
        if (s === 'current')
            return 'bg-base-100 border-primary text-base-content ring-4 ring-primary/10';
        return 'bg-base-100 border-base-content/15 text-base-content/40';
    }
</script>

<ol class="flex w-full max-w-md items-start" aria-label="Progress">
    {#each steps as step (step.n)}
        <li
            class="relative flex flex-1 flex-col items-center gap-2 text-center"
            aria-current={step.n === current ? 'step' : undefined}
        >
            <!-- Connector into this dot, active once the step is reached -->
            {#if step.n > 1}
                <span
                    class="absolute right-1/2 top-4 z-0 h-0.5 w-full {step.n <= current
                        ? 'bg-primary'
                        : 'bg-base-content/10'}"
                    aria-hidden="true"
                ></span>
            {/if}

            <span
                class="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border font-mono text-xs font-semibold transition-colors duration-300 {dotClass(
                    step.n,
                )}"
            >
                {#if stateOf(step.n) === 'done'}
                    <svg
                        class="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                    >
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                {:else}
                    {step.n}
                {/if}
            </span>

            <span
                class="font-mono text-[10px] uppercase tracking-wider transition-colors duration-300 {stateOf(
                    step.n,
                ) === 'current'
                    ? 'font-semibold text-base-content'
                    : 'text-base-content/45'}"
            >
                {step.label}
            </span>
        </li>
    {/each}
</ol>
