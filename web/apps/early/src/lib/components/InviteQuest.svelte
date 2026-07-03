<script lang="ts">
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import QuestCard from './QuestCard.svelte';
    import { POINTS } from '$lib/quests';

    interface Props {
        referralLink: string;
        // Real credited count (advisory materialized; authoritative at export).
        referralCount: number;
        recommended?: boolean;
        open?: boolean;
        ontoggle?: () => void;
    }

    let { referralLink, referralCount, recommended = false, open = false, ontoggle }: Props =
        $props();

    // Re-share intent — members keep spreading Zarf with their invite link.
    const SHARE_TEXT =
        'Airdrops, but with privacy built in.\n\n' +
        'I just joined the @zarfto beta for private ZK airdrops on @StellarOrg ✨.\n\n' +
        'Claim an early spot 🛬';

    const intentHref = $derived(
        `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}` +
            `&url=${encodeURIComponent(referralLink)}`
    );

    // Honest tally — referral_count is credited only when a referred signup
    // becomes eligible. We make no unbacked queue-position claim.
    const friendsLine = $derived(
        referralCount === 0
            ? 'No invited friends yet — share your link to start earning.'
            : referralCount === 1
              ? '1 friend has joined through your invite'
              : `${referralCount} friends have joined through your invite`
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

<!-- Invite never "completes" — it accrues up to the cap. -->
<QuestCard
    title="Invite friends"
    pointsLabel={`+${POINTS.referralEach} ea`}
    {recommended}
    {open}
    {ontoggle}
>
    <div class="flex flex-col gap-2">
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
        <ZenButton variant="primary" size="lg" class="w-full">Share your invite ↗</ZenButton>
    </a>
</QuestCard>
