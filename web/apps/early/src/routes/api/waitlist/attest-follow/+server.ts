import type { RequestHandler } from './$types';
import { markFollowAttested } from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';

export const prerender = false;

// 5 attestations within 24h forces a fresh OAuth round trip. upsertTwitterUser
// resets the counter on the next login, so a legitimate user with sticky
// follow-state hiccups can recover by re-authenticating — the message below
// tells them so. Bots that just hammer the endpoint without re-auth get stuck.
const ATTEST_LIMIT = 5;
const ATTEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: attest is 404 in any non-X mode.
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  // Narrow the flattened Subject to an X subject — attest is X-only. After this
  // guard `user.follow_*` / `user.id` are accessed flat (one level).
  const user = event.locals.user;
  if (user?.kind !== 'x') {
    return apiError(ERROR_CODES.UNAUTHORIZED, 401, 'unauthorized');
  }

  // Check counters BEFORE the write so a rate-limited user doesn't tick up
  // forever. The check is racy under concurrent requests from the same user
  // (count-then-write TOCTOU) but the attest endpoint isn't a write-amplifier
  // — the worst case is a handful of extra increments past 5, still bounded
  // and still requiring re-auth to clear.
  if (
    user.follow_attest_count >= ATTEST_LIMIT &&
    user.follow_attest_last_at !== null &&
    Date.now() - user.follow_attest_last_at < ATTEST_WINDOW_MS
  ) {
    return apiError(
      ERROR_CODES.RATE_LIMITED,
      429,
      'too many attestations; re-authenticate to retry'
    );
  }

  let updated;
  try {
    updated = await markFollowAttested(env.DB, user.id);
  } catch (e) {
    logServerError('waitlist.attest', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }

  return apiOk({
    ok: true,
    follow_attested_at: updated.follow_attested_at
  });
};
