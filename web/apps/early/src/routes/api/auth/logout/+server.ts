import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/db';
import { clearSessionCookie } from '$lib/server/session';
import { apiError, apiOk, logServerError, ERROR_CODES } from '$lib/server/errors';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  if (event.locals.sessionId) {
    // Today's hooks invariant guarantees DB is present whenever sessionId is
    // set, but a future hooks refactor could break that. Failing closed here
    // — instead of falling through to "clear cookie + 200" — defends against
    // an unnoticed regression that would silently leave the server-side row
    // intact while telling the client logout succeeded.
    const db = event.platform?.env.DB;
    if (!db) {
      // Log presence only — the session id is a bearer credential and
      // logServerError lands in Cloudflare logs (wrangler tail, logpush).
      // Matches the codebase pattern: callback uses `cookiePresent`, never the
      // raw cookie value. scope + code already identify the failure mode.
      logServerError('auth.logout', ERROR_CODES.PLATFORM_UNAVAILABLE, {
        sessionIdPresent: true
      });
      return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'logout failed');
    }
    try {
      await deleteSession(db, event.locals.sessionId);
    } catch (e) {
      logServerError('auth.logout', ERROR_CODES.INTERNAL, e);
      return apiError(ERROR_CODES.INTERNAL, 500, 'logout failed');
    }
  }
  clearSessionCookie(event.cookies);
  return apiOk({ ok: true });
};
