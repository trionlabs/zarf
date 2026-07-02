// Audit log for admin actions (Phase 2b of plans/security-remediation.md).
// One row per privileged operation. Designed for after-the-fact forensics, not
// real-time alerting — the table is append-only; nothing in the app reads it
// outside the rate-cap COUNT below.

const IP_MAX = 64;
const UA_MAX = 256;
const DETAIL_MAX_BYTES = 1024;

export type AuditAction =
  | 'export_csv'
  | 'export_emails'
  | 'manual_verify'
  | 'manual_sweep'
  | 'admin_login_fail'
  | 'post_reverify_sweep'
  | 'delete_user';

export type AuditEvent = {
  adminId: string;
  action: AuditAction;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown>;
};

function truncate(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function serializeDetail(detail: Record<string, unknown> | undefined): string | null {
  if (!detail) return null;
  const json = JSON.stringify(detail);
  if (json.length <= DETAIL_MAX_BYTES) return json;
  // Don't slice — that would store corrupt JSON in a column the schema labels
  // as JSON. Replace with a sentinel that keeps `json_extract(detail_json, ...)`
  // valid for every row, while signaling that the original payload was dropped.
  return JSON.stringify({ _truncated: true, original_size: json.length });
}

// Build the prepared statement without running it. Lets state-mutating callers
// compose the audit insert into a `db.batch([...])` with their mutation so the
// two commit atomically — the audit row exists iff the action did. The optional
// `now` lets callers share one timestamp between the mutation and the audit row,
// avoiding microsecond drift on downstream timeline joins.
export function prepareAuditInsert(
  db: D1Database,
  event: AuditEvent,
  now: number = Date.now()
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (
         id, admin_id, action, target_id, ip, user_agent, detail_json, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
    .bind(
      crypto.randomUUID(),
      event.adminId,
      event.action,
      event.targetId ?? null,
      truncate(event.ip, IP_MAX),
      truncate(event.userAgent, UA_MAX),
      serializeDetail(event.detail),
      now
    );
}

export async function recordAuditEvent(db: D1Database, event: AuditEvent): Promise<void> {
  await prepareAuditInsert(db, event).run();
}

// Count an admin's actions of one type in a rolling window. The result is
// inherently racy against concurrent inserts (count-then-insert TOCTOU); callers
// that need a strict cap must layer an atomic mechanism on top. Adequate for the
// single-admin export cap.
export async function countAdminActionsSince(
  db: D1Database,
  adminId: string,
  action: AuditAction,
  sinceMs: number
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log
        WHERE admin_id = ?1 AND action = ?2 AND created_at > ?3`
    )
    .bind(adminId, action, sinceMs)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
