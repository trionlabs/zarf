import type { RequestHandler } from './$types';
import { bumpWalletSubmitCounter } from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { isValidStellarAccount } from '$lib/server/strkey';
import { buildWalletLinkMessage } from '$lib/server/walletsig';

export const prerender = false;

// POST-only by design (no GET). The hooks.server.ts origin-CSRF guard only
// covers non-GET requests, so a challenge minted via GET would be forgeable
// cross-origin; POST also keeps the nonce out of URLs/caches/referrers.

// Shared wallet-submit counters (wallet_submit_count / wallet_submit_last_at) are
// bumped by BOTH challenge and verify, so one full "connect wallet" attempt
// (challenge → sign → verify) consumes TWO ticks. The limit is 16 per 24h —
// double complete/+server.ts's 8 — so a user still gets ~8 full attempts before
// the window locks. NOT reset on re-auth (upsertTwitterUser leaves wallet_submit_*
// alone), so re-authenticating is not a rate-limit bypass; the 24h window is the
// only recovery path.
const WALLET_SUBMIT_LIMIT = 16;
const WALLET_SUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Challenge lifetime: the KV entry self-expires and verify re-checks freshness.
const CHALLENGE_TTL_S = 300;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: wallet endpoints are 404 in any non-X mode (mirrors
  // attest-follow / complete).
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  // Narrow the flattened Subject to an X subject — linking a wallet is X-only.
  // After this guard `user.*` is accessed flat (one level).
  const user = event.locals.user;
  if (user?.kind !== 'x') {
    return apiError(ERROR_CODES.UNAUTHORIZED, 401, 'unauthorized');
  }

  const now = Date.now();

  // Rate limit — count-then-write window check (mirrors attest-follow /
  // complete). Racy under concurrent same-user requests (TOCTOU) but bounded:
  // worst case a few extra ticks past 16, still gated by the 24h window. Return
  // BEFORE the counter bump so a limited user doesn't tick up forever.
  if (
    user.wallet_submit_count >= WALLET_SUBMIT_LIMIT &&
    user.wallet_submit_last_at !== null &&
    now - user.wallet_submit_last_at < WALLET_SUBMIT_WINDOW_MS
  ) {
    return apiError(ERROR_CODES.RATE_LIMITED, 429, 'too many submissions; try again later');
  }

  // Parse + validate body. Never log the address.
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }
  const { address } = (body ?? {}) as { address?: unknown };
  if (typeof address !== 'string' || !isValidStellarAccount(address)) {
    return apiError(ERROR_CODES.INVALID_WALLET, 400, 'invalid stellar address');
  }

  // In-quota + valid → this is a real attempt: bump the shared counter now,
  // before minting the challenge (mirrors complete's "bump on every real
  // attempt" philosophy — verify bumps again on its own attempt).
  await bumpWalletSubmitCounter(env.DB, user.id, now);

  // 32-byte random nonce, hex. crypto.getRandomValues is CSPRNG under workerd.
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  // KV challenge record (OAUTH_STATE reuse). Value binds the nonce to THIS
  // session's X id + the requested address + the SERVER clock — verify cross-
  // checks all three against the session and never trusts a client echo.
  // One-time use + 300s TTL; verify deletes it unconditionally on consume.
  const record = JSON.stringify({ xUserId: user.id, address, issuedAt: now });
  try {
    await env.OAUTH_STATE.put(`wallet_chal:${nonce}`, record, {
      expirationTtl: CHALLENGE_TTL_S
    });
  } catch (e) {
    logServerError('waitlist.wallet-challenge', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'challenge persistence failed');
  }

  // The client signs `message` RAW with Freighter (which applies the SEP-53
  // prefix internally). The server rebuilds this exact string at verify time
  // from the KV record — the returned message is a convenience, never trusted.
  const message = buildWalletLinkMessage({
    xUserId: user.id,
    address,
    nonce,
    issuedAt: now
  });

  return apiOk({ nonce, message });
};
