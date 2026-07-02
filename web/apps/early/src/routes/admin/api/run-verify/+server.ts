import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/admin';
import { loadPendingForVerify, bulkSetFollowVerified } from '$lib/server/db';
import { fetchAllFollowers } from '$lib/server/twitter';
import { recordAuditEvent } from '$lib/server/audit';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';

export const prerender = false;

// Admin-triggered follower sweep. Replaces the original two-worker cron pipeline
// (cron worker → HMAC → main worker /api/cron/verify-followers): with no
// auto-fire schedule there's no reason to keep a second worker just to host a
// `scheduled` handler, and operator UX is much better when the trigger is a
// button in the admin UI than a "Send Event" click in the Cloudflare dashboard.
//
// Auth: isAdmin via the existing session-based gate. No HMAC, no nonce store —
// the admin's signed session cookie is the authentication.
export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: the sweep is X-only — 404 in any non-X mode, BEFORE the
  // TWITTER_BEARER_TOKEN / BRAND_X_USER_ID config-missing 500 check.
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  const user = event.locals.user;
  if (!isAdmin(user, env.ADMIN_X_USER_IDS, env.ADMIN_EMAILS)) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 403, 'admin only');
  }

  if (!env.TWITTER_BEARER_TOKEN || !env.BRAND_X_USER_ID) {
    logServerError('admin.run-verify', ERROR_CODES.CONFIG_MISSING, {
      reason: 'TWITTER_BEARER_TOKEN or BRAND_X_USER_ID not set'
    });
    return apiError(ERROR_CODES.CONFIG_MISSING, 500, 'server misconfigured');
  }

  // Pull the pending set BEFORE the X API call. If the X fetch fails we want
  // to know we didn't change anything on the DB side. (loadPendingForVerify
  // is read-only.)
  let pending;
  try {
    pending = await loadPendingForVerify(env.DB);
  } catch (e) {
    logServerError('admin.run-verify', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'pending query failed');
  }

  if (pending.length === 0) {
    // Nothing to do. Skip the X API call entirely — saves the per-follower
    // billing on an empty sweep.
    await recordAuditEvent(env.DB, {
      adminId: user!.id,
      action: 'manual_sweep',
      ip: event.getClientAddress(),
      userAgent: event.request.headers.get('user-agent'),
      detail: { pending: 0, verified: 0, unverified: 0, skipped_x_api: true }
    });
    return apiOk({ verified: 0, unverified: 0, pending: 0, message: 'no pending users' });
  }

  let followers: string[];
  try {
    followers = await fetchAllFollowers(env.TWITTER_BEARER_TOKEN, env.BRAND_X_USER_ID);
  } catch (e) {
    logServerError('admin.run-verify', ERROR_CODES.OAUTH_FAILED, e);
    return apiError(ERROR_CODES.OAUTH_FAILED, 502, 'x follower fetch failed');
  }

  const followerSet = new Set(followers);
  const verifiedIds: string[] = [];
  const unverifiedIds: string[] = [];
  for (const p of pending) {
    if (followerSet.has(p.x_user_id)) {
      verifiedIds.push(p.id);
    } else {
      unverifiedIds.push(p.id);
    }
  }

  try {
    await bulkSetFollowVerified(env.DB, verifiedIds, unverifiedIds);
  } catch (e) {
    logServerError('admin.run-verify', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'bulk update failed');
  }

  await recordAuditEvent(env.DB, {
    adminId: user!.id,
    action: 'manual_sweep',
    ip: event.getClientAddress(),
    userAgent: event.request.headers.get('user-agent'),
    detail: {
      pending: pending.length,
      verified: verifiedIds.length,
      unverified: unverifiedIds.length,
      followers_fetched: followers.length
    }
  });

  return apiOk({
    verified: verifiedIds.length,
    unverified: unverifiedIds.length,
    pending: pending.length,
    followers_fetched: followers.length
  });
};
