<script lang="ts">
    import FollowQuest from './FollowQuest.svelte';
    import WalletQuest from './WalletQuest.svelte';
    import ShareQuest from './ShareQuest.svelte';
    import EmailQuest from './EmailQuest.svelte';
    import InviteQuest from './InviteQuest.svelte';
    import type { WalletState } from '$lib/quests';

    interface Props {
        brand: { name: string; handle: string };
        followAttested: boolean;
        walletAddress: WalletState;
        postVerified: boolean;
        hasEmail: boolean;
        consented: boolean;
        referralCode: string;
        referralLink: string;
        referralCount: number;
        // Done / total for the "N / 5" section counter (computed in +page).
        questsDone: number;
        questsTotal: number;
    }

    let {
        brand,
        followAttested,
        walletAddress,
        postVerified,
        hasEmail,
        consented,
        referralCode,
        referralLink,
        referralCount,
        questsDone,
        questsTotal
    }: Props = $props();

    // The single highest-value action still open — wallet is the biggest lever, so
    // it leads (matching the user's own flow: sign in → wallet → follow). Falls
    // through to the next open quest, and finally to invite (which never "completes").
    const recommendedKey = $derived(
        walletAddress !== 'verified'
            ? 'wallet'
            : !postVerified
              ? 'share'
              : !hasEmail
                ? 'email'
                : !followAttested
                  ? 'follow'
                  : 'invite'
    );

    // Accordion: exactly one quest open. Defaults to the recommended one (and
    // auto-advances as quests complete) until the user taps a row themselves.
    // undefined = follow recommendation; null = user closed everything.
    let manualOpen = $state<string | null | undefined>(undefined);
    const openKey = $derived(manualOpen === undefined ? recommendedKey : manualOpen);
    function toggle(key: string) {
        manualOpen = openKey === key ? null : key;
    }

    // Value cue on the recommended wallet row.
    const walletTag = $derived(
        recommendedKey === 'wallet'
            ? walletAddress === 'pasted'
                ? 'verify'
                : 'biggest'
            : undefined
    );
</script>

<div class="flex flex-col gap-3">
    <div class="flex items-center justify-between px-1.5">
        <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-base-content/40">
            Earn points
        </span>
        <span class="font-mono text-xs tabular-nums text-base-content/55">
            {questsDone} / {questsTotal}
        </span>
    </div>

    <!-- One-line rows; only the open one reveals its action. Order: Follow, Wallet
         (biggest), Share, Email, Invite. -->
    <div class="flex flex-col gap-2">
        <FollowQuest
            {brand}
            done={followAttested}
            recommended={recommendedKey === 'follow'}
            open={openKey === 'follow'}
            ontoggle={() => toggle('follow')}
        />
        <WalletQuest
            {walletAddress}
            {consented}
            recommended={recommendedKey === 'wallet'}
            tag={walletTag}
            open={openKey === 'wallet'}
            ontoggle={() => toggle('wallet')}
        />
        <ShareQuest
            {referralCode}
            done={postVerified}
            recommended={recommendedKey === 'share'}
            open={openKey === 'share'}
            ontoggle={() => toggle('share')}
        />
        <EmailQuest
            done={hasEmail}
            {consented}
            recommended={recommendedKey === 'email'}
            open={openKey === 'email'}
            ontoggle={() => toggle('email')}
        />
        <InviteQuest
            {referralLink}
            {referralCount}
            recommended={recommendedKey === 'invite'}
            open={openKey === 'invite'}
            ontoggle={() => toggle('invite')}
        />
    </div>
</div>
