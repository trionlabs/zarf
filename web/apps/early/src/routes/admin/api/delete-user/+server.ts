import type { RequestHandler } from './$types';
import { resolveAdmin } from '$lib/server/admin';
import { getUserById, prepareDeleteUser } from '$lib/server/db';
import { prepareAuditInsert } from '$lib/server/audit';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';

export const prerender = false;

// KVKK / GDPR PII scrub. Hard-deletes the twitter_users row + every session for
// the subject (deleteUserById does both in one atomic batch). Admin re-auth is
// the signed session cookie via isAdmin (same as run-verify) — no HMAC. No gate
// check: erasing a subject's PII must work regardless of gate mode.
export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  const auth = await resolveAdmin(event, env);
  if (!auth.ok) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 403, 'admin only');
  }

  let body: { userId?: unknown };
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }
  const userId = body.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'userId required');
  }

  try {
    // Pre-check existence so a typo'd / already-deleted id returns a clean 400
    // instead of silently no-op'ing and writing a phantom audit row.
    const existing = await getUserById(env.DB, userId);
    if (!existing) {
      return apiError(ERROR_CODES.BAD_REQUEST, 400, 'unknown user id');
    }

    // Atomic KVKK scrub: the PII delete (sessions + row) and its audit row
    // commit together or neither does — no mutate-then-audit gap where PII is
    // erased with NO trail. target_id is the now-deleted internal UUID (not
    // PII); detail carries NO PII (no username / email / wallet / post_url).
    const now = Date.now();
    await env.DB.batch([
      ...prepareDeleteUser(env.DB, userId),
      prepareAuditInsert(
        env.DB,
        {
          adminId: auth.adminId,
          action: 'delete_user',
          targetId: userId,
          ip: event.getClientAddress(),
          userAgent: event.request.headers.get('user-agent'),
          detail: { deleted: true }
        },
        now
      )
    ]);

    return apiOk({ deleted: true, userId });
  } catch (e) {
    logServerError('admin.delete-user', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'delete failed');
  }
};
