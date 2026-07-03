import type { RequestHandler } from './$types';
import { resolveAdmin } from '$lib/server/admin';
import { loadAllUsers, isEligible, POINTS_SQL } from '$lib/server/db';
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

const iso = (ms: number | null): string | null => (ms ? new Date(ms).toISOString() : null);

// POST (not GET) so the hooks origin guard gives CSRF protection. This CSV now
// carries PII (email + wallet + points + the full funnel output for cohort
// review), so a cross-origin GET would be both a cap-exhaustion AND a data-leak
// vector.
//
// ─── This CSV is NOT the launch airdrop feed ────────────────────────────────
// This is the human/spreadsheet cohort-review artifact. csvCell() quotes and
// escapes every field (and prefixes formula-injection chars with a quote), which
// breaks create.zarf.to's naive parseCSV (a plain split on , / \n) — do NOT pipe
// this file into the airdrop leaf builder.
//
// The authoritative launch feed is loadLaunchOrdering(db) in $lib/server/db: the
// LIVE-eligible rows (consent_at NOT NULL AND (email OR stellar_address)),
// ordered exactly like the on-screen queue — POINTS_SQL DESC, created_at ASC,
// id ASC (id is a random UUID, so created_at is the real tiebreak and id is only
// the final deterministic disambiguator). Pull it on launch day as an UNQUOTED,
// machine-parseable feed with a wrangler one-liner that mirrors that query,
// substituting the POINTS_SQL fragment from db.ts verbatim (keep it the single
// source of the weights so the feed, the queue, and this export never diverge):
//
//   wrangler d1 execute zarf-early --remote --json --command "\
//     SELECT username, x_user_id, email, stellar_address, wallet_sig_verified_at, \
//            <POINTS_SQL> AS points, eligible_at, referral_count, \
//            x_followers_count, x_account_created_at, follow_attempt_count, \
//            follow_verified_at \
//       FROM twitter_users \
//      WHERE consent_at IS NOT NULL AND (email IS NOT NULL OR stellar_address IS NOT NULL) \
//      ORDER BY <POINTS_SQL> DESC, created_at ASC, id ASC"
//
// Points/rank order the queue, but authoritative ALLOCATION must NOT take the
// feed at face value: discount self-claimed follow attests that never got a
// paid-sweep confirmation (follow_attested_at set but follow_verified_at NULL),
// treat follow_attempt_count > 0 as an attest-without-follow bot flag, and weigh
// the sybil signals (x_followers_count, x_account_created_at) for cohort review
// before minting leaves.
export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }
  const auth = await resolveAdmin(event, env);
  if (!auth.ok) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 403, 'admin only');
  }

  // Soft rate cap: count-then-insert against audit_log (racy but adequate for a
  // single admin). POST + origin guard blocks the cross-origin abuse the old GET
  // handler had to document as accepted risk.
  try {
    const recent = await countAdminActionsSince(
      env.DB,
      auth.adminId,
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

    // Points are compute-on-read (no materialized column), so loadAllUsers does
    // NOT carry them. Recompute here with POINTS_SQL — THE single source of the
    // weights (same fragment getQueueStanding / loadLaunchOrdering use) — via one
    // extra full-scan keyed by id, then fold into the rows below. Kept as a
    // separate query (rather than duplicating loadAllUsers' column list) so this
    // route imports the fragment, not a hand-copied arithmetic that could drift.
    const pointsRes = await env.DB.prepare(
      `SELECT id, ${POINTS_SQL} AS points FROM twitter_users`
    ).all<{ id: string; points: number }>();
    const pointsById = new Map<string, number>();
    for (const r of pointsRes.results ?? []) pointsById.set(r.id, r.points);

    const header = [
      'username',
      'x_user_id',
      'name',
      'created_at_iso',
      'attested_at_iso',
      'verified_at_iso',
      'attempt_count',
      'post_verified_at_iso',
      'post_url',
      'stellar_address',
      'email',
      'completed_at_iso',
      'consent_at_iso',
      'referral_count',
      'x_followers_count',
      'x_account_created_at_iso',
      // ─── Appended by the redesign (Package E) — existing columns above keep
      // their index for downstream column-index consumers. ──────────────────
      'points', // POINTS_SQL recompute (queue/launch-ordering weights)
      'eligible', // 0/1 LIVE isEligible derivation (consent + >=1 identity)
      'eligible_at_iso', // immutable first-flip stamp (empty until first eligible)
      'wallet_sig_verified_at_iso', // SEP-53 signature proof time (empty when unproven)
      'wallet_verified' // 0/1 convenience flag: wallet_sig_verified_at present
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const u of users) {
      lines.push(
        [
          csvCell(u.username),
          csvCell(u.x_user_id),
          csvCell(u.name),
          csvCell(iso(u.created_at)),
          csvCell(iso(u.follow_attested_at)),
          csvCell(iso(u.follow_verified_at)),
          csvCell(u.follow_attempt_count),
          csvCell(iso(u.post_verified_at)),
          csvCell(u.post_url),
          csvCell(u.stellar_address),
          csvCell(u.email),
          csvCell(iso(u.completed_at)),
          csvCell(iso(u.consent_at)),
          csvCell(u.referral_count),
          csvCell(u.x_followers_count),
          csvCell(iso(u.x_account_created_at)),
          // Appended (Package E). isEligible mirrors the POINTS_SQL eligibility
          // guard; wallet_verified is a convenience flag over wallet_sig_verified_at.
          csvCell(pointsById.get(u.id) ?? 0),
          csvCell(isEligible(u) ? 1 : 0),
          csvCell(iso(u.eligible_at)),
          csvCell(iso(u.wallet_sig_verified_at)),
          csvCell(u.wallet_sig_verified_at !== null ? 1 : 0)
        ].join(',')
      );
    }
    const body = lines.join('\n');
    const filename = 'zarf-early-' + new Date().toISOString().slice(0, 10) + '.csv';

    // Fail-closed: no export ships without an audit row.
    await recordAuditEvent(env.DB, {
      adminId: auth.adminId,
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
