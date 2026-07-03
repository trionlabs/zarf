import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { markPostVerified, bumpPostVerifyCounter } from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';
import { isMockOAuthEnabled } from '$lib/server/env';
import { verifyPost } from '$lib/server/oembed';

export const prerender = false;

// 10 verification attempts within 24h. An `oembed_unavailable` outcome does
// NOT count against this (it never bumps the counter) — only attempts that
// actually consumed an oEmbed decision (not_found / wrong_author / missing_link
// / bad_request) burn quota. Re-auth deliberately does NOT reset this counter
// (see upsertTwitterUser) so it can't be bypassed by re-logging in; 10/24h is
// generous for a legitimate user.
const POST_VERIFY_LIMIT = 10;
const POST_VERIFY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Map each terminal verify failure to its stable error code + client message.
// oembed_unavailable is handled separately (503, no counter bump) before this.
const FAILURE_MAP = {
  post_not_found: { code: ERROR_CODES.POST_NOT_FOUND, message: 'tweet not found or not public' },
  post_wrong_author: {
    code: ERROR_CODES.POST_WRONG_AUTHOR,
    message: 'this tweet is not from your account'
  },
  post_missing_link: {
    code: ERROR_CODES.POST_MISSING_LINK,
    message: 'this tweet does not mention the campaign'
  },
  bad_request: { code: ERROR_CODES.BAD_REQUEST, message: 'not a valid tweet URL' }
} as const;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: verify-post is 404 in any non-X mode.
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  // Narrow the flattened Subject to an X subject — verify-post is X-only. After
  // this guard `user.post_*` / `user.follow_attested_at` / `user.username` are
  // accessed flat (one level).
  const user = event.locals.user;
  if (user?.kind !== 'x') {
    return apiError(ERROR_CODES.UNAUTHORIZED, 401, 'unauthorized');
  }

  // (a) Idempotency FIRST: if already verified, return OK immediately — no
  // counter bump, no oEmbed call. Re-clicking never burns quota or moves the
  // clock.
  if (user.post_verified_at !== null) {
    return apiOk({ ok: true, post_verified_at: user.post_verified_at });
  }

  // (b) Precondition: the follow step must be attested before post verify.
  if (user.follow_attested_at === null) {
    return apiError(ERROR_CODES.STEP_LOCKED, 409, 'complete the follow step first');
  }

  // (c) Rate limit: 10/24h, windowed off post_verify_last_at. The window
  // resets once last_at is older than 24h (mirror of attest-follow). Racy
  // count-then-write, but bounded — worst case a few extra increments past 10.
  if (
    user.post_verify_count >= POST_VERIFY_LIMIT &&
    user.post_verify_last_at !== null &&
    Date.now() - user.post_verify_last_at < POST_VERIFY_WINDOW_MS
  ) {
    return apiError(ERROR_CODES.RATE_LIMITED, 429, 'too many attempts; try again later');
  }

  // (d) Parse + validate the body.
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid JSON body');
  }
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || url.length === 0) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'url is required');
  }

  // (e) Verify. Mock mode is dev-only and gated on the full sentinel pair
  // (isMockOAuthEnabled already requires `dev`; the extra `dev &&` documents
  // the constraint at the call site and can never widen prod behaviour).
  const result = await verifyPost(url, user.username, {
    mock: dev && isMockOAuthEnabled(env)
  });

  // (f) Map failures.
  if (!result.ok) {
    // Transient: never burns the rate-limit counter.
    if (result.code === 'oembed_unavailable') {
      return apiError(ERROR_CODES.OEMBED_UNAVAILABLE, 503, 'verification service unavailable');
    }
    // Every other failure consumed a real verification attempt → bump quota.
    try {
      await bumpPostVerifyCounter(env.DB, user.id, Date.now());
    } catch (e) {
      // Non-fatal: log but still return the mapped failure to the client.
      logServerError('waitlist.verify-post.bump', ERROR_CODES.INTERNAL, e);
    }
    const mapped = FAILURE_MAP[result.code];
    return apiError(mapped.code, 400, mapped.message);
  }

  // (g) Success → persist. First-write-wins on post_verified_at; a
  // UNIQUE(post_id) violation means another account already claimed this tweet.
  const now = Date.now();
  try {
    await markPostVerified(env.DB, user.id, result.canonicalUrl, result.postId, now);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE') && msg.includes('post_id')) {
      return apiError(ERROR_CODES.POST_ALREADY_USED, 409, 'this tweet has already been used');
    }
    logServerError('waitlist.verify-post', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }

  return apiOk({ ok: true, post_verified_at: now });
};
