import type { RequestHandler } from './$types';
import { resolveAdmin } from '$lib/server/admin';
import { loadAllEmailSignups } from '$lib/server/db';
import { resolveGateMode, gateAllowsEmail, gateAllowsX } from '$lib/server/gate';
import { apiError, ERROR_CODES, logServerError } from '$lib/server/errors';
import { countAdminActionsSince, recordAuditEvent } from '$lib/server/audit';

export const prerender = false;

const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPORT_MAX_PER_WINDOW = 5;

// Wrap any value in quotes and escape embedded quotes for safe CSV. Prefix
// leading =, +, -, @, tab, CR with a single quote to neutralize spreadsheet
// formula injection (Excel/Sheets evaluate `=cmd|...` on open). Mirrors the X
// export route's csvCell — the only export defense that actually exists.
function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

// POST (not GET) so the hooks origin guard gives CSRF protection — email PII
// warrants the stronger control than the X export's GET + accepted-risk posture.
export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }
  const gateMode = resolveGateMode(env);
  if (!gateAllowsEmail(gateMode)) {
    return apiError(ERROR_CODES.FORBIDDEN, 404, 'email export disabled');
  }

  // Admin auth: allowlisted Subject OR the ADMIN_KEY break-glass cookie, via the
  // shared resolveAdmin helper. adminId is the subject UUID or 'admin-cookie'.
  const auth = await resolveAdmin(event, env);
  if (!auth.ok) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 403, 'admin only');
  }
  const adminId = auth.adminId;

  try {
    const recent = await countAdminActionsSince(
      env.DB,
      adminId,
      'export_emails',
      Date.now() - EXPORT_WINDOW_MS
    );
    if (recent >= EXPORT_MAX_PER_WINDOW) {
      return apiError(ERROR_CODES.RATE_LIMITED, 429, 'export rate limit (5/24h)');
    }
  } catch (e) {
    logServerError('admin.export-emails', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'export failed');
  }

  try {
    const signups = await loadAllEmailSignups(env.DB);
    const includeX = gateAllowsX(gateMode);
    const header = ['email', 'created_at_iso', 'confirmed_at_iso', 'source'];
    if (includeX) header.push('x_user_id');

    const lines = [header.map(csvCell).join(',')];
    for (const s of signups) {
      const row = [
        csvCell(s.email),
        csvCell(new Date(s.created_at).toISOString()),
        csvCell(s.confirmed_at ? new Date(s.confirmed_at).toISOString() : null),
        csvCell(s.source)
      ];
      if (includeX) row.push(csvCell(s.x_user_id));
      lines.push(row.join(','));
    }
    const body = lines.join('\n');
    const filename = 'zarf-early-emails-' + new Date().toISOString().slice(0, 10) + '.csv';

    // Fail-closed: no export ships without an audit row.
    await recordAuditEvent(env.DB, {
      adminId,
      action: 'export_emails',
      ip: event.getClientAddress(),
      userAgent: event.request.headers.get('user-agent'),
      detail: { rows: signups.length, bytes: body.length }
    });

    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store'
      }
    });
  } catch (e) {
    logServerError('admin.export-emails', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'export failed');
  }
};
