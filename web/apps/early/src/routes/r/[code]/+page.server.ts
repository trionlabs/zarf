import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isValidRefCode, setRefCookie } from '$lib/server/referral';
import { findUserByReferralCode } from '$lib/server/db';

// Referral landing. FORMAT-VALIDATE ONLY — no D1 existence requirement (per the
// plan). A well-formed code always sets the first-touch cookie; a code that
// resolves to no real inviter is harmless (a spray of fake codes just leaves an
// unresolvable cookie that completion-time crediting silently ignores). The D1
// lookup here is purely to personalize the card ("@handle invited you"). This
// route NEVER writes to D1 — setRefCookie only touches the response cookie.
export const load: PageServerLoad = async ({ params, cookies, platform }) => {
  const code = params.code;

  // Bad shape can't be a real referral → bounce home WITHOUT setting a cookie.
  if (!isValidRefCode(code)) {
    throw redirect(302, '/');
  }

  // First-touch: no-op if a referral cookie is already present (earliest
  // referrer wins). Set for any well-formed code regardless of existence.
  setRefCookie(cookies, code);

  // Null-safe inviter lookup — display only.
  let inviterHandle: string | null = null;
  const db = platform?.env?.DB;
  if (db) {
    const inviter = await findUserByReferralCode(db, code);
    inviterHandle = inviter?.username ?? null;
  }

  return { code, inviterHandle };
};
