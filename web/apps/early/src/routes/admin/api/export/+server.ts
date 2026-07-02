import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/admin';
import { loadAllUsers } from '$lib/server/db';
import { apiError, ERROR_CODES, logServerError } from '$lib/server/errors';
import { countAdminActionsSince, recordAuditEvent } from '$lib/server/audit';

export const prerender = false;

const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPORT_MAX_PER_WINDOW = 5;

// Wrap any value in quotes and escape embedded quotes for safe CSV.
// Prefix leading =, +, -, @, tab, CR with a single quote to neutralize
// spreadsheet formula injection (Excel/Sheets evaluate `=cmd|...` on open).
function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }
  const user = event.locals.user;
  if (!isAdmin(user, env.ADMIN_X_USER_IDS, undefined)) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 403, 'admin only');
  }

  // Soft rate cap: count-then-insert against audit_log. Two concurrent admin
  // requests can both observe count=4 and both proceed — acceptable for the
  // single-admin app. Swap for an atomic counter (D1 UPDATE ... RETURNING, or
  // KV) if multi-admin or programmatic access ever lands.
  //
  // Known abuse vector (out of scope for Phase 2): this is a GET handler, so
  // the hooks originMismatch guard (POST/PUT/DELETE only) doesn't apply. A
  // malicious site embedding <img src="https://early.zarf.to/admin/api/export">
  // could make a logged-in admin's browser fire 5 requests in a row and
  // exhaust the cap, locking the admin out for 24h. The CSV bytes are opaque
  // to cross-origin JS so the data doesn't leak — only the cap is abused.
  // Real defense (POST-only + same-origin confirmation token) is heavier than
  // the risk for a single-admin app.
  try {
    const recent = await countAdminActionsSince(
      env.DB,
      user!.id,
      'export_csv',
      Date.now() - EXPORT_WINDOW_MS
    );
    if (recent >= EXPORT_MAX_PER_WINDOW) {
      return apiError(ERROR_CODES.RATE_LIMITED, 429, 'export rate limit (5/24h)');
    }
  } catch (e) {
    logServerError('admin.export', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'export failed');
  }

  try {
    const users = await loadAllUsers(env.DB);
    const header = [
      'username',
      'x_user_id',
      'name',
      'created_at_iso',
      'attested_at_iso',
      'verified_at_iso',
      'attempt_count'
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const u of users) {
      lines.push(
        [
          csvCell(u.username),
          csvCell(u.x_user_id),
          csvCell(u.name),
          csvCell(new Date(u.created_at).toISOString()),
          csvCell(u.follow_attested_at ? new Date(u.follow_attested_at).toISOString() : null),
          csvCell(u.follow_verified_at ? new Date(u.follow_verified_at).toISOString() : null),
          csvCell(u.follow_attempt_count)
        ].join(',')
      );
    }
    const body = lines.join('\n');
    const filename = 'zarf-early-' + new Date().toISOString().slice(0, 10) + '.csv';

    // Audit before returning. Fail-closed: if the audit row can't be written
    // we refuse to ship the data — the whole point of the table is that no
    // export goes out without a trail. Matches the logout fail-closed pattern.
    await recordAuditEvent(env.DB, {
      adminId: user!.id,
      action: 'export_csv',
      ip: event.getClientAddress(),
      userAgent: event.request.headers.get('user-agent'),
      detail: { rows: users.length, bytes: body.length }
    });

    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store'
      }
    });
  } catch (e) {
    logServerError('admin.export', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'export failed');
  }
};
