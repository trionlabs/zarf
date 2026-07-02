import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { missingTwitterEnv } from '$lib/server/env';
import { isValidRefCode, setRefCookie } from '$lib/server/referral';
import { getQueuePosition } from '$lib/server/db';

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

  // Fixed queue rank — only meaningful once an X subject has completed the
  // funnel. getQueuePosition throws on a non-completed user, so guard on
  // completed_at before calling.
  let queue: { position: number; total: number } | null = null;
  if (env?.DB && subject?.kind === 'x' && subject.completed_at) {
    queue = await getQueuePosition(env.DB, subject);
  }

  return {
    subject, // Subject | null (key is `subject`, not `user`)
    gateMode,
    brand: { name: env?.BRAND_NAME ?? 'Brand', handle: env?.BRAND_HANDLE ?? '' },
    // X is offerable only when the gate allows it AND the X env is fully wired.
    xConfigured: gateAllowsX(gateMode) && missingTwitterEnv(env).length === 0,
    // Fixed queue position for a completed subject, else null.
    queue,
    // The subject's personal share/referral link, else null.
    referralLink:
      subject?.kind === 'x' && subject.referral_code
        ? `https://early.zarf.to/r/${subject.referral_code}`
        : null,
    // Surfaced from the OAuth callback's `/?error=<code>` redirect.
    authError: url.searchParams.get('error')
  };
};
