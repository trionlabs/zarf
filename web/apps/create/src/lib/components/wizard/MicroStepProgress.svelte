<script lang="ts">
    interface Segment {
        label: string;
        href?: string | null; // present + non-null => clickable (jump to a completed step)
        complete?: boolean;
    }
    let { segments, current }: { segments: Segment[]; current: number } = $props();
</script>

<nav aria-label="Distribution setup steps" class="flex items-center gap-1 text-xs">
    {#each segments as seg, i (seg.label)}
        {@const isActive = i === current}
        {@const isNav = !!seg.href && !isActive}
        {#if i > 0}
            <span aria-hidden="true" class="text-zen-fg-faint select-none">·</span>
        {/if}
        <svelte:element
            this={isNav ? 'a' : 'span'}
            href={isNav ? seg.href : undefined}
            aria-current={isActive ? 'step' : undefined}
            class="px-2 py-0.5 rounded-md font-medium transition-colors select-none
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-primary/40
                {isActive
                ? 'bg-zen-fg/[0.06] text-zen-fg'
                : isNav
                  ? 'text-zen-fg-subtle hover:text-zen-fg hover:bg-zen-fg/[0.04] cursor-pointer'
                  : 'text-zen-fg-faint'}"
        >
            {seg.label}
        </svelte:element>
    {/each}
</nav>
