<script lang="ts">
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenBadge from '@zarf/ui/components/ui/ZenBadge.svelte';

    interface Props {
        position: number;
        total: number;
        referralLink: string;
        referralCount: number;
        username: string;
        profileImageUrl?: string | null;
        // Whether the user verified a share post (vs skipped the optional step).
        posted?: boolean;
        onLogout?: () => void;
    }

    let {
        position,
        total,
        referralLink,
        referralCount,
        username,
        profileImageUrl = null,
        posted = false,
        onLogout,
    }: Props = $props();

    // Same suggested copy as PostGate — the re-share intent lets members keep
    // spreading Zarf with their invite link after they're on the list.
    const SHARE_TEXT =
        'Just landed on @zarfto — private ZK airdrops on Stellar. Claiming my beta tester spot 🛬 #LandedOnZarf';

    const intentHref = $derived(
        `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}` +
            `&url=${encodeURIComponent(referralLink)}`,
    );

    // Honest referral tally — referral_count is real (credited when a referred
    // signup completes). We make no unbacked queue-position claim.
    const friendsLine = $derived(
        (referralCount ?? 0) === 0
            ? 'Invite friends to the beta with your link'
            : (referralCount ?? 0) === 1
              ? '1 friend has joined through your invite'
              : `${referralCount} friends have joined through your invite`,
    );

    let copied = $state(false);
    async function copyLink() {
        try {
            await navigator.clipboard.writeText(referralLink);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            // Clipboard unavailable (permissions / insecure context) — no-op; the
            // link is visible for manual copy.
        }
    }
</script>

<ZenCard variant="glass" radius="2xl" padding="lg" class="text-left">
    <div class="flex flex-col gap-5">
        <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
                {#if profileImageUrl}
                    <img
                        src={profileImageUrl}
                        alt=""
                        class="h-8 w-8 rounded-full ring-1 ring-base-content/15"
                    />
                {/if}
                <span class="text-sm font-semibold text-base-content">@{username}</span>
            </div>
            {#if onLogout}
                <ZenButton variant="ghost" size="sm" onclick={onLogout}>Sign out</ZenButton>
            {/if}
        </div>

        <div class="flex flex-col gap-4">
            <div
                class="flex h-11 w-11 items-center justify-center rounded-full bg-zen-success-muted text-zen-success"
                aria-hidden="true"
            >
                <svg
                    class="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
            </div>

            <div class="flex flex-col gap-2">
                <ZenBadge variant="success" size="md" class="w-fit uppercase tracking-wider">
                    You're in
                </ZenBadge>
                <h1
                    class="text-2xl font-bold leading-tight tracking-tight text-base-content sm:text-3xl"
                >
                    You're Beta Tester <span class="text-zen-success">#{position}</span>
                    <span class="font-medium text-base-content/50">of {total}</span>
                </h1>
                <p class="text-sm leading-relaxed text-base-content/60">
                    {#if posted}
                        Thanks for sharing — you're on the list. We'll deliver your beta airdrop to
                        your email when we launch.
                    {:else}
                        You're on the list. We'll deliver your beta airdrop to your email when we
                        launch — share your invite link below to bring friends along.
                    {/if}
                </p>
            </div>
        </div>

        <div class="flex flex-col gap-2 border-t border-base-content/5 pt-5">
            <span class="font-mono text-[10px] uppercase tracking-widest text-base-content/45">
                Your invite link
            </span>
            <div class="flex items-stretch gap-2">
                <ZenInput
                    value={referralLink}
                    readonly
                    aria-label="Your invite link"
                    class="font-mono text-xs"
                    containerClass="flex-1 min-w-0"
                />
                <ZenButton variant="secondary" size="md" onclick={copyLink}>
                    {copied ? 'Copied ✓' : 'Copy'}
                </ZenButton>
            </div>
            <p class="text-xs leading-snug text-base-content/55">{friendsLine}</p>
        </div>

        <a href={intentHref} target="_blank" rel="noopener noreferrer" class="block w-full">
            <ZenButton variant="primary" size="lg" class="w-full">
                {posted ? 'Share again ↗' : 'Share your invite ↗'}
            </ZenButton>
        </a>
    </div>
</ZenCard>
