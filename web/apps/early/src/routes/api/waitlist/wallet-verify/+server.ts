import type { RequestHandler } from './$types';
import {
  bumpWalletSubmitCounter,
  writeConsent,
  writeWalletVerified,
  setEligibleIfUnset,
  creditReferrer
} from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { isValidStellarAccount } from '$lib/server/strkey';
import { buildWalletLinkMessage, verifyWalletSignature } from '$lib/server/walletsig';

export const prerender = false;

// Shared wallet-submit counters with wallet-challenge. See that file for the
// limit rationale: 16 per 24h because challenge AND verify each bump, so one full
// attempt costs two ticks (~8 full attempts). NOT reset on re-auth.
const WALLET_SUBMIT_LIMIT = 16;
const WALLET_SUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Challenge freshness bound — matches wallet-challenge's KV TTL. Defence in
// depth: KV already expires the entry, but we re-check the server-clock issuedAt
// so a clock-skewed / long-lived edge case can't accept a stale challenge.
const CHALLENGE_MAX_AGE_MS = 300_000;

// Shape of the KV challenge record written by wallet-challenge.
type ChallengeRecord = { xUserId: string; address: string; issuedAt: number };

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: wallet endpoints are 404 in any non-X mode.
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  // Narrow the flattened Subject to an X subject. After this guard `user.*` is
  // accessed flat (one level).
  const user = event.locals.user;
  if (user?.kind !== 'x') {
    return apiError(ERROR_CODES.UNAUTHORIZED, 401, 'unauthorized');
  }

  const now = Date.now();

  // Rate limit — count-then-write window check (mirrors complete / challenge).
  // Return BEFORE any write/bump so a limited user doesn't tick up forever.
  if (
    user.wallet_submit_count >= WALLET_SUBMIT_LIMIT &&
    user.wallet_submit_last_at !== null &&
    now - user.wallet_submit_last_at < WALLET_SUBMIT_WINDOW_MS
  ) {
    return apiError(ERROR_CODES.RATE_LIMITED, 429, 'too many submissions; try again later');
  }

  // Parse + shape-validate body. Never log nonce/address/signature.
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }
  const { nonce, address, signature, consent } = (body ?? {}) as {
    nonce?: unknown;
    address?: unknown;
    signature?: unknown;
    consent?: unknown;
  };
  if (typeof nonce !== 'string' || !/^[0-9a-fA-F]{64}$/.test(nonce)) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid nonce');
  }
  if (typeof address !== 'string' || !isValidStellarAccount(address)) {
    return apiError(ERROR_CODES.INVALID_WALLET, 400, 'invalid stellar address');
  }
  if (typeof signature !== 'string' || signature.length === 0 || signature.length > 512) {
    return apiError(ERROR_CODES.INVALID_SIGNATURE, 401, 'invalid signature');
  }

  // Consent gate: storing a wallet address is PII-consent-gated. If the user has
  // never consented, this request must carry `consent: true` (the ConsentControl
  // checkbox) — we record consent first, then proceed. Without it, refuse before
  // any counter bump or challenge consume (this isn't a "real attempt").
  if (user.consent_at === null) {
    if (consent !== true) {
      return apiError(ERROR_CODES.CONSENT_REQUIRED, 400, 'consent required');
    }
    try {
      await writeConsent(env.DB, user.id, now);
    } catch (e) {
      logServerError('waitlist.wallet-verify', ERROR_CODES.INTERNAL, e);
      return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
    }
  }

  // In-quota + well-formed + consent-satisfied → a real attempt: bump the shared
  // counter now, BEFORE the uniqueness outcome (mirrors complete's philosophy —
  // a valid submission that later collides on a taken wallet still burns quota).
  await bumpWalletSubmitCounter(env.DB, user.id, now);

  // Consume the challenge: get + UNCONDITIONAL delete (one-time use, mirrors the
  // OAuth callback pattern) so a replayed nonce can't verify twice.
  const key = `wallet_chal:${nonce}`;
  const rawRecord = await env.OAUTH_STATE.get(key);
  await env.OAUTH_STATE.delete(key);
  if (!rawRecord) {
    return apiError(ERROR_CODES.CHALLENGE_EXPIRED, 400, 'challenge expired');
  }

  let record: ChallengeRecord;
  try {
    const parsed = JSON.parse(rawRecord) as Partial<ChallengeRecord>;
    if (
      typeof parsed.xUserId !== 'string' ||
      typeof parsed.address !== 'string' ||
      typeof parsed.issuedAt !== 'number'
    ) {
      return apiError(ERROR_CODES.CHALLENGE_EXPIRED, 400, 'challenge expired');
    }
    record = { xUserId: parsed.xUserId, address: parsed.address, issuedAt: parsed.issuedAt };
  } catch {
    return apiError(ERROR_CODES.CHALLENGE_EXPIRED, 400, 'challenge expired');
  }

  // Cross-check the challenge against the session + request. The nonce binds to
  // THIS session's X id and the address it was minted for; anti-phishing rests on
  // xUserId === session id. All three checks collapse to one error so we never
  // leak WHICH check failed. Freshness is defence in depth over KV's own TTL.
  if (
    record.xUserId !== user.id ||
    record.address !== address ||
    now - record.issuedAt >= CHALLENGE_MAX_AGE_MS
  ) {
    return apiError(ERROR_CODES.CHALLENGE_EXPIRED, 400, 'challenge expired');
  }

  // Rebuild the signed message SERVER-SIDE from the trusted KV record — never
  // trust a client-echoed message. Freighter signed the RAW message (it applies
  // the SEP-53 prefix internally); verifyWalletSignature adds the prefix once.
  const message = buildWalletLinkMessage({
    xUserId: record.xUserId,
    address: record.address,
    nonce,
    issuedAt: record.issuedAt
  });
  const ok = await verifyWalletSignature(address, message, signature);
  if (!ok) {
    return apiError(ERROR_CODES.INVALID_SIGNATURE, 401, 'invalid signature');
  }

  // Persist the verified wallet with reclaim semantics (Package A): a verified
  // signature evicts an UNVERIFIED squatter holding this address by paste, but a
  // verified-vs-verified collision hits UNIQUE(stellar_address) and the whole
  // batch rolls back → parse the failing column and map to WALLET_TAKEN 409.
  let reclaimed = false;
  try {
    const res = await writeWalletVerified(env.DB, user.id, address, message, signature, now);
    reclaimed = res.reclaimed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('twitter_users.stellar_address')) {
      return apiError(ERROR_CODES.WALLET_TAKEN, 409, 'wallet already registered');
    }
    logServerError('waitlist.wallet-verify', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }

  // Exactly-once eligibility flip + referral credit. setEligibleIfUnset stamps
  // eligible_at only on the FIRST transition into the eligible set (consent +
  // >=1 identity); flipped === true iff THIS call did it. That flip is the exact
  // trigger to credit a real, different referrer once — the direct port of the
  // old complete-on-completion credit (never on login: sybil-cheap).
  const { flipped } = await setEligibleIfUnset(env.DB, user.id, now);
  if (flipped && user.referred_by !== null && user.referred_by !== user.id) {
    await creditReferrer(env.DB, user.referred_by);
  }

  // Minimal body: the UI calls invalidateAll() and re-derives points / rank /
  // eligibility from fresh page data. `reclaimed` lets the client message the
  // squatter-eviction case if it wants.
  return apiOk({ verified: true, reclaimed });
};
