import type { RequestHandler } from './$types';
import { writeConsent, setEligibleIfUnset, creditReferrer } from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';

export const prerender = false;

// POST /api/waitlist/consent — record explicit KVKK/GDPR consent to store an
// airdrop identity (the ConsentControl checkbox). The act of POSTing here with a
// valid X session IS the consent, so no request body is required or read — `{}`
// and `{consent:true}` are both accepted. writeConsent is first-write-wins
// (COALESCE), so this is fully idempotent and needs NO rate-limit counter: it is
// a single session-gated write that can never move the clock or grow state.
export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: 404 in any non-X mode (mirrors attest-follow / complete).
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  // Narrow the flattened Subject to an X subject — consent is X-only.
  const user = event.locals.user;
  if (user?.kind !== 'x') {
    return apiError(ERROR_CODES.UNAUTHORIZED, 401, 'unauthorized');
  }

  const now = Date.now();
  try {
    await writeConsent(env.DB, user.id, now);

    // setEligibleIfUnset + referral credit as cheap insurance. Consent is
    // normally NOT the last missing piece — identity writes (email/wallet) are
    // themselves consent-gated, so those endpoints already flip eligibility. But
    // a user whose only identity was a wallet address later RECLAIMED by another
    // account (then re-added), or a future path, could reach the eligible set on
    // a consent write. The flip is exactly-once (eligible_at IS NULL guard), so
    // running it here can never double-credit; it just closes the gap.
    const { flipped } = await setEligibleIfUnset(env.DB, user.id, now);
    if (flipped && user.referred_by !== null && user.referred_by !== user.id) {
      await creditReferrer(env.DB, user.referred_by);
    }
  } catch (e) {
    logServerError('waitlist.consent', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }

  return apiOk({ consented: true });
};
