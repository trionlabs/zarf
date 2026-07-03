import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { missingTwitterEnv } from '$lib/server/env';
import { isValidRefCode, setRefCookie } from '$lib/server/referral';
import { getQueueStanding, isEligible, type QueueStanding } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, platform, url, cookies }) => {
  // First-touch referral capture via ?ref= on the root URL (mirrors /r/[code]):
  // set the cookie (no-op if one is already present) then redirect to strip the
  // param so the address bar stays clean and the code isn't re-processed.
  const ref = url.searchParams.get('ref');
  if (isValidRefCode(ref)) {
    setRefCookie(cookies, ref);
    throw redirect(302, '/');
  }

  const env = platform?.env;
  const gateMode = resolveGateMode(env);
  const subject = locals.user;
  const x = subject?.kind === 'x' ? subject : null;

  // Points-based standing + live eligibility for the dashboard. The instant-in
  // model means EVERY X subject has a standing (getQueueStanding never throws;
  // it returns position: null for a 0-point user). No completed_at guard.
  let standing: QueueStanding | null = null;
  let eligible = false;
  // Per-quest state flags, mirrored to the UI (the server is the source of truth).
  let quest = {
    followAttested: false,
    postVerified: false,
    walletAddress: 'none' as 'none' | 'pasted' | 'verified',
    hasEmail: false,
    consented: false,
    referralCount: 0
  };

  if (env?.DB && x) {
    standing = await getQueueStanding(env.DB, x);
    eligible = isEligible(x);
    quest = {
      followAttested: x.follow_attested_at != null,
      postVerified: x.post_verified_at != null,
      walletAddress:
        x.wallet_sig_verified_at != null ? 'verified' : x.stellar_address != null ? 'pasted' : 'none',
      hasEmail: x.email != null,
      consented: x.consent_at != null,
      referralCount: x.referral_count ?? 0
    };
  }

  return {
    subject, // Subject | null (key is `subject`, not `user`)
    gateMode,
    brand: { name: env?.BRAND_NAME ?? 'Brand', handle: env?.BRAND_HANDLE ?? '' },
    // X is offerable only when the gate allows it AND the X env is fully wired.
    xConfigured: gateAllowsX(gateMode) && missingTwitterEnv(env).length === 0,
    // Points-based queue standing (null for a non-X subject).
    standing,
    // Live airdrop eligibility (consent + >=1 identity).
    eligible,
    // Per-quest completion flags driving the dashboard cards.
    quest,
    // The subject's personal share/referral link + code, else null.
    referralCode: x?.referral_code ?? null,
    referralLink: x?.referral_code ? `https://early.zarf.to/r/${x.referral_code}` : null,
    // Surfaced from the OAuth callback's `/?error=<code>` redirect.
    authError: url.searchParams.get('error')
  };
};
