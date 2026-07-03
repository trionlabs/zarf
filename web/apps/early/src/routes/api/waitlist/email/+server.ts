import type { RequestHandler } from './$types';
import {
  writeConsent,
  writeEmail,
  setEligibleIfUnset,
  creditReferrer,
  bumpEmailSubmitCounter,
  isEligible
} from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { isValidEmail } from '$lib/server/email';

export const prerender = false;

// 8 email submissions within 24h. Like the wallet counters (and unlike
// follow-attest), email_submit_* is NOT reset on re-auth (upsertTwitterUser
// leaves it alone), so re-authenticating is not a rate-limit bypass — the 24h
// window is the only recovery path. Own counters; NOT shared with wallet_submit_*.
const EMAIL_SUBMIT_LIMIT = 8;
const EMAIL_SUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: 404 in any non-X mode (mirrors attest-follow / complete).
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  // Narrow the flattened Subject to an X subject — the funnel is X-first.
  const user = event.locals.user;
  if (user?.kind !== 'x') {
    return apiError(ERROR_CODES.UNAUTHORIZED, 401, 'unauthorized');
  }

  const now = Date.now();

  // (a) Idempotent replay: the email is immutable once set (writeEmail is
  // WHERE email IS NULL — the exact literal becomes a ZK merkle leaf). An
  // already-set user gets the success shape back with NO counter bump, NO
  // re-validation. A user with an email always has consent_at (email storage is
  // consent-gated), so `eligible` reflects the loaded row directly.
  if (user.email !== null) {
    return apiOk({ saved: true, eligible: isEligible(user) });
  }

  // Parse body.
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }
  const { email: rawEmail, consent } = (body ?? {}) as { email?: unknown; consent?: unknown };

  // (b) Validate the email shape first (cheap, no writes). Literal
  // canonicalization ONLY — trim + lowercase. This exact string later feeds
  // Zarf's ZK merkle leaf, so do NOT gmail dot/plus-fold it. Never log the email.
  if (typeof rawEmail !== 'string') {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'email required');
  }
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid email');
  }

  // (c) Rate limit — mirror of attest-follow / complete's count-then-write
  // window. Racy under concurrent same-user requests (TOCTOU) but bounded, and
  // returns BEFORE any bump so a limited user's counter doesn't tick up (the 24h
  // window measured from the last real bump is the recovery path).
  if (
    user.email_submit_count >= EMAIL_SUBMIT_LIMIT &&
    user.email_submit_last_at !== null &&
    now - user.email_submit_last_at < EMAIL_SUBMIT_WINDOW_MS
  ) {
    return apiError(ERROR_CODES.RATE_LIMITED, 429, 'too many submissions; try again later');
  }

  // (d) Consent gate: storing an email is PII-consent-gated. If the user has no
  // consent_at yet, the request may carry `consent:true` to record it inline
  // (writeConsent is first-write-wins); otherwise refuse before any write.
  if (user.consent_at === null) {
    if (consent === true) {
      await writeConsent(env.DB, user.id, now);
    } else {
      return apiError(ERROR_CODES.CONSENT_REQUIRED, 400, 'consent required');
    }
  }

  // (e) Bump on every fully-validated, in-quota attempt — BEFORE the uniqueness
  // outcome — so a valid submission that collides on a taken email still burns
  // quota (enumeration protection). Malformed / consent-less / rate-limited
  // requests returned above and never reach here.
  await bumpEmailSubmitCounter(env.DB, user.id, now);

  // (f) Persist. writeEmail is first-write-wins (WHERE email IS NULL): written
  // === false means a concurrent request set it first — treat as success (the
  // winner owns the flip/credit). A UNIQUE(email) collision with ANOTHER user
  // surfaces as a D1 error we map to 409 by parsing the failing column — a racing
  // duplicate must get 409, never 500.
  let written: boolean;
  try {
    const res = await writeEmail(env.DB, user.id, email, now);
    written = res.written;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('twitter_users.email')) {
      return apiError(ERROR_CODES.EMAIL_TAKEN, 409, 'email already registered');
    }
    logServerError('waitlist.email', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }

  // (g) Eligibility flip + exactly-once referral credit, ONLY on a genuine write.
  // setEligibleIfUnset stamps eligible_at on the first transition into the
  // eligible set (consent + >=1 identity) and reports {flipped} true exactly
  // once; the atomic guard makes this race-safe across the email/wallet/consent
  // call sites, so the referral credit — relocated here from the old /complete
  // endpoint — fires exactly once per user. On written === false the winning
  // request owns the flip, so we skip it.
  if (written) {
    const { flipped } = await setEligibleIfUnset(env.DB, user.id, now);
    if (flipped && user.referred_by !== null && user.referred_by !== user.id) {
      await creditReferrer(env.DB, user.referred_by);
    }
  }

  // (h) Minimal response — the UI re-derives everything via invalidateAll().
  // Patch the loaded row (email now set; consent_at set above if it was null) to
  // compute live eligibility without a re-fetch.
  const eligible = isEligible({
    consent_at: user.consent_at ?? now,
    email,
    stellar_address: user.stellar_address
  });
  return apiOk({ saved: true, eligible });
};
