<script lang="ts">
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import type { EligibilityState } from '$lib/quests';

    interface Props {
        // The user's own points — a hero number that only goes UP.
        points: number;
        // Rank among points>0 users; null when unranked (0 points). Number only,
        // never "of N".
        position: number | null;
        // consent + >=1 identity → eligible; else one_step / consent.
        eligibility: EligibilityState;
        // Completed / total quests → the progress pips.
        questsDone: number;
        questsTotal: number;
        username: string;
        profileImageUrl?: string | null;
        onLogout?: () => void;
        loggingOut?: boolean;
    }

    let {
        points,
        position,
        eligibility,
        questsDone,
        questsTotal,
        username,
        profileImageUrl = null,
        onLogout,
        loggingOut = false
    }: Props = $props();

    // Rank is shown ONLY when it's backed by points (never fabricate a number).
    const ranked = $derived(points > 0 && position != null);

    // X returns the 48px `_normal` avatar inline at login (free, already stored);
    // `_400x400` is the same CDN asset at retina sharpness — no extra API cost.
    const avatar = $derived(profileImageUrl ? profileImageUrl.replace('_normal', '_400x400') : null);
</script>

<ZenCard variant="glass" radius="2xl" padding="lg" class="text-left">
    <div class="flex flex-col gap-5">
        <!-- Identity + sign out -->
        <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
                {#if avatar}
                    <img
                        src={avatar}
                        alt=""
                        class="h-8 w-8 rounded-full object-cover ring-1 ring-base-content/15"
                    />
                {/if}
                <span class="text-sm font-semibold text-base-content">@{username}</span>
            </div>
            {#if onLogout}
                <ZenButton variant="ghost" size="sm" onclick={onLogout} disabled={loggingOut}>
                    Sign out
                </ZenButton>
            {/if}
        </div>

        <!-- Score: points hero + rank + eligibility, one glance -->
        <div class="flex items-end gap-3">
            <span
                class="font-mono text-5xl font-bold leading-[0.85] tracking-tighter text-base-content tabular-nums"
            >
                {points}
            </span>
            <span
                class="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-base-content/40"
            >
                points
            </span>

            <div class="mb-0.5 ml-auto flex flex-col items-end gap-1.5">
                {#if ranked}
                    <span class="font-mono text-[15px] font-bold tabular-nums text-base-content"
                        >#{position}</span
                    >
                {/if}
                {#if eligibility === 'eligible'}
                    <span class="inline-flex items-center gap-1.5 text-xs text-zen-success">
                        <span class="h-1.5 w-1.5 rounded-full bg-current"></span> Eligible
                    </span>
                {:else}
                    <span
                        class="inline-flex items-center gap-1.5 text-xs text-zen-warning-content"
                    >
                        <span class="h-1.5 w-1.5 rounded-full border border-current"></span>
                        {eligibility === 'one_step' ? '1 step to enter' : 'Consent to enter'}
                    </span>
                {/if}
            </div>
        </div>

        <!-- Progress pips — quiet momentum, no numbers to read -->
        <div class="flex gap-1.5">
            {#each Array(questsTotal) as _, i (i)}
                <span
                    class="h-1 flex-1 rounded-full {i < questsDone
                        ? 'bg-primary'
                        : 'bg-base-content/[0.12]'}"
                ></span>
            {/each}
        </div>
    </div>
</ZenCard>
