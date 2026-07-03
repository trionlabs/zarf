<script lang="ts">
    import type { Snippet } from 'svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';

    interface Props {
        // Quest title (e.g. "Follow on X"). Kept SHORT — a verb, not a sentence.
        title: string;
        // Points chip copy (e.g. "+10", "+40").
        pointsLabel: string;
        // When true the card collapses to a single ✓ row (quest complete).
        done?: boolean;
        // Collapsed-row label; defaults to `title`. Honest copy overrides live here
        // (e.g. "Follow recorded — we'll confirm").
        doneLabel?: string;
        // The "+N" chip shown in the collapsed done row; defaults to pointsLabel.
        earnedLabel?: string;
        // Highlights this as the single best next action (filled ◆ icon + tag).
        recommended?: boolean;
        // Tiny uppercase tag on the row (e.g. "biggest", "verify") — value cue.
        tag?: string;
        // Accordion open state (ignored when done). Only one quest is open at a
        // time; the parent QuestList owns which — an open row lifts to glass.
        open?: boolean;
        // Row click → parent toggles the accordion.
        ontoggle?: () => void;
        // Expanded body (CTA / form). Rendered only when open AND not done.
        children?: Snippet;
    }

    let {
        title,
        pointsLabel,
        done = false,
        doneLabel,
        earnedLabel,
        recommended = false,
        tag,
        open = false,
        ontoggle,
        children
    }: Props = $props();
</script>

{#if done}
    <!-- Collapsed: a quiet ✓ row. Green check + green points signal completion. -->
    <ZenCard variant="bordered" padding="none" radius="2xl">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
            <div class="flex items-center gap-3">
                <span
                    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zen-success-content text-base-100"
                    aria-hidden="true"
                >
                    <svg
                        class="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </span>
                <span class="text-[15px] font-medium text-base-content/80">{doneLabel ?? title}</span>
            </div>
            <span class="font-mono text-xs font-semibold text-zen-success">
                {earnedLabel ?? pointsLabel}
            </span>
        </div>
    </ZenCard>
{:else}
    <!-- An open quest lifts to `glass` (elevated focus); the rest stay `bordered`. -->
    <ZenCard variant={open ? 'glass' : 'bordered'} padding="none" radius="2xl" class="overflow-hidden">
        <button
            type="button"
            onclick={ontoggle}
            class="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-base-content/[0.02]"
            aria-expanded={open}
        >
            {#if recommended}
                <span
                    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-content"
                    aria-hidden="true">◆</span
                >
            {:else}
                <span
                    class="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-base-content/25"
                    aria-hidden="true"
                ></span>
            {/if}

            <span class="flex-1 text-[15px] font-semibold text-base-content">{title}</span>

            {#if tag}
                <span
                    class="shrink-0 rounded-full border border-base-content/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary"
                    >{tag}</span
                >
            {/if}

            <span
                class="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary"
                >{pointsLabel}</span
            >

            <span
                class="shrink-0 text-xs text-base-content/35 transition-transform duration-200 {open
                    ? 'rotate-180'
                    : ''}"
                aria-hidden="true">⌄</span
            >
        </button>

        {#if open}
            <div class="flex flex-col gap-4 px-4 pb-4 pt-1">
                {@render children?.()}
            </div>
        {/if}
    </ZenCard>
{/if}
