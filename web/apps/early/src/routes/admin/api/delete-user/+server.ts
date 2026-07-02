import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/admin';
import { getUserById, deleteUserById } from '$lib/server/db';
import { recordAuditEvent } from '$lib/server/audit';
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

  const user = event.locals.user;
  if (!isAdmin(user, env.ADMIN_X_USER_IDS, env.ADMIN_EMAILS)) {
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

    await deleteUserById(env.DB, userId);

    // Audit AFTER the delete (mirrors run-verify's mutate-then-audit order).
    // target_id is the now-deleted internal id — forensically truthful, and an
    // internal UUID alone is not PII. detail carries NO PII (no username /
    // email / wallet / post_url).
    await recordAuditEvent(env.DB, {
      adminId: user!.id,
      action: 'delete_user',
      targetId: userId,
      ip: event.getClientAddress(),
      userAgent: event.request.headers.get('user-agent'),
      detail: { deleted: true }
    });

    return apiOk({ deleted: true, userId });
  } catch (e) {
    logServerError('admin.delete-user', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'delete failed');
  }
};
