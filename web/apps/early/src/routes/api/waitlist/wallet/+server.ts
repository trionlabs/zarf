import type { RequestHandler } from './$types';
import {
  writeConsent,
  writeWalletPaste,
  setEligibleIfUnset,
  creditReferrer,
  bumpWalletSubmitCounter,
  isEligible
} from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { isValidStellarAccount } from '$lib/server/strkey';

export const prerender = false;

// 16 wallet submissions within 24h. RAISED from the old 8 because Package B's
// wallet-challenge and wallet-verify endpoints SHARE these same wallet_submit_*
// counters and each bumps once, so a single connect+sign round trip already
// costs 2 — the ceiling was doubled so the paste fallback isn't starved by a
// couple of signature attempts. Like email_submit_*, NOT reset on re-auth (the
// 24h window is the only recovery path), and NOT shared with email_submit_*.
const WALLET_SUBMIT_LIMIT = 16;
const WALLET_SUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  // (a) Idempotent replay: once ANY address is on the row (pasted or verified)
  // this endpoint is a no-op success — no bump, no re-validation. Paste is
  // deliberately one-shot here (mirrors the old /complete replay); typo
  // correction is NOT exposed on this path — the connect+sign path (Package B)
  // reclaims/overwrites an unverified paste. A row with an address always has
  // consent_at (address storage is consent-gated), so `eligible` reflects the
  // loaded row directly.
  if (user.stellar_address !== null) {
    return apiOk({ saved: true, eligible: isEligible(user) });
  }

  // Parse body.
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }
  const { address, consent } = (body ?? {}) as { address?: unknown; consent?: unknown };

  // (b) Validate the address (cheap, no writes). isValidStellarAccount rejects
  // M.../S... and bad checksums; the raw input is never logged on any path.
  if (typeof address !== 'string' || !isValidStellarAccount(address)) {
    return apiError(ERROR_CODES.INVALID_WALLET, 400, 'invalid stellar address');
  }

  // (c) Rate limit — same count-then-write window as email/attest, BEFORE bump.
  if (
    user.wallet_submit_count >= WALLET_SUBMIT_LIMIT &&
    user.wallet_submit_last_at !== null &&
    now - user.wallet_submit_last_at < WALLET_SUBMIT_WINDOW_MS
  ) {
    return apiError(ERROR_CODES.RATE_LIMITED, 429, 'too many submissions; try again later');
  }

  // (d) Consent gate — storing an address is PII-consent-gated, same as email.
  if (user.consent_at === null) {
    if (consent === true) {
      await writeConsent(env.DB, user.id, now);
    } else {
      return apiError(ERROR_CODES.CONSENT_REQUIRED, 400, 'consent required');
    }
  }

  // (e) Bump on every validated, in-quota attempt, pre-uniqueness (enumeration
  // protection) — the same counter the challenge/verify endpoints bump.
  await bumpWalletSubmitCounter(env.DB, user.id, now);

  // (f) Persist a PASTED (unproven) address. writeWalletPaste is gated on
  // wallet_sig_verified_at IS NULL so it can never downgrade a verified wallet;
  // written === false means a verify landed in the race — treat as success. A
  // UNIQUE(stellar_address) collision with another row → 409 (parse the column);
  // a racing duplicate must get 409, never 500.
  let written: boolean;
  try {
    const res = await writeWalletPaste(env.DB, user.id, address, now);
    written = res.written;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('twitter_users.stellar_address')) {
      return apiError(ERROR_CODES.WALLET_TAKEN, 409, 'wallet already registered');
    }
    logServerError('waitlist.wallet', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }

  // (g) Exactly-once eligibility flip + referral credit, only on a genuine write
  // (the same relocated credit as the email endpoint; setEligibleIfUnset makes
  // the multiple identity call sites race-safe).
  if (written) {
    const { flipped } = await setEligibleIfUnset(env.DB, user.id, now);
    if (flipped && user.referred_by !== null && user.referred_by !== user.id) {
      await creditReferrer(env.DB, user.referred_by);
    }
  }

  // (h) Minimal response; the UI re-derives everything via invalidateAll().
  const eligible = isEligible({
    consent_at: user.consent_at ?? now,
    email: user.email,
    stellar_address: address
  });
  return apiOk({ saved: true, eligible });
};
