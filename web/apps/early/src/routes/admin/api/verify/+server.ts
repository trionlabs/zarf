import type { RequestHandler } from './$types';
import { resolveAdmin } from '$lib/server/admin';
import { getUserById, prepareMarkFollowVerifiedManual } from '$lib/server/db';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { prepareAuditInsert } from '$lib/server/audit';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  const auth = await resolveAdmin(event, env);
  if (!auth.ok) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 403, 'admin only');
  }

  let body: { id?: string };
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }
  if (!body.id || typeof body.id !== 'string') {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'id required');
  }

  try {
    // Pre-check existence. UPDATE on a missing id silently matches 0 rows but
    // the audit INSERT in the batch would still commit, leaving audit_log
    // polluted with phantom verify rows for typo'd or already-deleted ids.
    // (Regression introduced when we moved to the atomic batch — the prior
    // code threw before recordAuditEvent ran, so this never happened.)
    const existing = await getUserById(env.DB, body.id);
    if (!existing) {
      return apiError(ERROR_CODES.BAD_REQUEST, 400, 'unknown user id');
    }

    // Atomic: the UPDATE and the audit INSERT commit together or neither does.
    // db.batch wraps them in a single D1 transaction. Without this, a failing
    // audit insert would still leave the verify state change in place — the
    // earlier "audit then return" pattern was fail-after-mutation, not
    // fail-closed (review R1/R2 on PR #2). One `now` shared by both rows so
    // audit_log.created_at == twitter_users.follow_verified_at exactly.
    const now = Date.now();
    await env.DB.batch([
      prepareMarkFollowVerifiedManual(env.DB, body.id, now),
      prepareAuditInsert(
        env.DB,
        {
          adminId: auth.adminId,
          action: 'manual_verify',
          targetId: body.id,
          ip: event.getClientAddress(),
          userAgent: event.request.headers.get('user-agent')
        },
        now
      )
    ]);

    const updated = await getUserById(env.DB, body.id);
    if (!updated) {
      // Pre-check passed but the row vanished before the post-batch read.
      // Only reachable if another writer deleted the row in the microsecond
      // window between the two queries (impossible under the single-admin
      // invariant). Surface as 409 so the operator distinguishes this from
      // a real 500 — the audit row is committed and points at a now-deleted
      // target, which is forensically truthful.
      return apiError(ERROR_CODES.CONFLICT, 409, 'verify race: target gone');
    }
    return apiOk({ user: updated });
  } catch (e) {
    logServerError('admin.verify', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'verify failed');
  }
};
