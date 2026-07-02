import type { RequestHandler } from './$types';
import {
  completeFunnel,
  creditReferrer,
  getQueuePosition,
  bumpWalletSubmitCounter
} from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { isValidEmail } from '$lib/server/email';
import { isValidStellarAccount } from '$lib/server/strkey';

export const prerender = false;

// 8 wallet+email submissions within 24h. Unlike follow-attest, this counter is
// NOT reset on re-auth (upsertTwitterUser deliberately leaves wallet_submit_*
// alone — see the migration plan) so re-authenticating is not a rate-limit
// bypass. The 24h window is the only recovery path; the message says so.
const WALLET_SUBMIT_LIMIT = 8;
const WALLET_SUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const REFERRAL_LINK_BASE = 'https://early.zarf.to/r/';

// Both success returns (idempotent replay + fresh completion) share this shape.
// referral_count is advisory (materialized credit); the authoritative launch
// ordering recomputes it at export time, so a slightly stale value here is fine.
const buildOk = (
  subject: { referral_code: string | null; referral_count: number },
  position: number,
  total: number
): Response =>
  apiOk({
    position,
    total,
    referral_code: subject.referral_code,
    referral_link: `${REFERRAL_LINK_BASE}${subject.referral_code}`,
    referral_count: subject.referral_count
  });

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: complete is 404 in any non-X mode (mirrors attest-follow).
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  // Narrow the flattened Subject to an X subject — the funnel is X-first. After
  // this guard `user.*` is accessed flat (one level).
  const user = event.locals.user;
  if (user?.kind !== 'x') {
    return apiError(ERROR_CODES.UNAUTHORIZED, 401, 'unauthorized');
  }

  // (a) Idempotent replay: an already-completed user gets the success payload
  // back immediately — no counter bump, no re-validation, no re-credit. The
  // existing subject already carries completed_at, so getQueuePosition works
  // against it directly.
  if (user.completed_at !== null) {
    const { position, total } = await getQueuePosition(env.DB, user);
    return buildOk(user, position, total);
  }

  // (b) Precondition: step 4 is locked until the post-verify step (step 3) is
  // done. (A completed user is handled above, so this only guards fresh runs.)
  if (user.post_verified_at === null) {
    return apiError(ERROR_CODES.STEP_LOCKED, 409, 'verify your post before completing');
  }

  const now = Date.now();

  // (c) Rate limit — mirrors attest-follow's count-then-write window check.
  // Racy under concurrent same-user requests (count-then-write TOCTOU) but
  // bounded: worst case a few extra increments past 8, still gated by the 24h
  // window. Return BEFORE any counter bump so a limited user doesn't tick up.
  if (
    user.wallet_submit_count >= WALLET_SUBMIT_LIMIT &&
    user.wallet_submit_last_at !== null &&
    now - user.wallet_submit_last_at < WALLET_SUBMIT_WINDOW_MS
  ) {
    return apiError(ERROR_CODES.RATE_LIMITED, 429, 'too many submissions; try again later');
  }

  // Parse body.
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }
  const { address, email: rawEmail, consent } = (body ?? {}) as {
    address?: unknown;
    email?: unknown;
    consent?: unknown;
  };

  // (d) Validate. Order: consent → email → wallet. Never log address/email.
  if (consent !== true) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'consent required');
  }
  if (typeof rawEmail !== 'string' || typeof address !== 'string') {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'address and email required');
  }
  // Literal canonicalization only: trim + lowercase. This exact string later
  // feeds Zarf's ZK merkle leaf, so do NOT gmail dot/plus-fold it.
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid email');
  }
  if (!isValidStellarAccount(address)) {
    return apiError(ERROR_CODES.INVALID_WALLET, 400, 'invalid stellar address');
  }

  // Counter-bump decision: bump on every REAL attempt — i.e. once the request
  // is well-formed, in-quota, and fully validated — but BEFORE the uniqueness
  // outcome. So a valid submission that collides on a taken email/wallet still
  // burns quota (enumeration protection); malformed/consent-less/typo requests
  // that never reach here do not.
  await bumpWalletSubmitCounter(env.DB, user.id, now);

  // (e) Complete. The single conditional UPDATE is race-safe (WHERE
  // completed_at IS NULL); a UNIQUE(email|stellar_address) collision surfaces as
  // a D1 error we map to a 409 by parsing the failing column out of the message
  // — a racing duplicate must get 409, never 500.
  let completed: boolean;
  try {
    const res = await completeFunnel(env.DB, user.id, {
      stellarAddress: address,
      email,
      now
    });
    completed = res.completed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('twitter_users.stellar_address')) {
      return apiError(ERROR_CODES.WALLET_TAKEN, 409, 'wallet already registered');
    }
    if (msg.includes('twitter_users.email')) {
      return apiError(ERROR_CODES.EMAIL_TAKEN, 409, 'email already registered');
    }
    logServerError('waitlist.complete', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }

  // (f) Referral credit — ONLY when THIS call flipped the row (completed) and
  // the user has a real, different referrer. Separate await, never batched into
  // completeFunnel: an unconditional batch would double-credit under a same-user
  // race (the second, no-op UPDATE would still run the credit statement).
  if (completed && user.referred_by !== null && user.referred_by !== user.id) {
    await creditReferrer(env.DB, user.referred_by);
  }

  // (g) Response. completed_at was just written as `now`; construct the queue
  // subject from the loaded row + now (getQueuePosition only reads completed_at
  // + id). If `completed` is false a concurrent same-user request won the race —
  // the funnel is still done, so returning its position is correct.
  const { position, total } = await getQueuePosition(env.DB, { ...user, completed_at: now });
  return buildOk(user, position, total);
};
