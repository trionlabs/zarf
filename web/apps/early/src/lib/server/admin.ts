import type { Subject } from './db';
import type { RequestEvent } from '@sveltejs/kit';
import { verifyAdminCookie, ADMIN_COOKIE } from './session';

// Admin check against the flattened Subject union.
//   - kind === 'x'     → match the immutable numeric X user id against
//                        ADMIN_X_USER_IDS.
//   - kind === 'email' → match the normalized email against ADMIN_EMAILS
//                        (allowlist, no confirm flow).
//
// The `__Host-` admin cookie (M1) is the PRIMARY email-mode admin entry, set by
// /admin/login; this Subject-based path is the secondary allowlist. Email
// sessions don't exist in MVP (email signup is a one-shot capture, not a login),
// so the kind==='email' branch is mostly dormant — but it is correct if an email
// session is ever minted.
export function isAdmin(
  subject: Subject | null,
  idWhitelist: string | undefined,
  emailWhitelist: string | undefined
): boolean {
  if (!subject) return false;

  if (subject.kind === 'x') {
    const ids = parseList(idWhitelist);
    return ids.has(subject.x_user_id);
  }

  // kind === 'email'
  const emails = parseList(emailWhitelist);
  return emails.has(subject.email_norm);
}

function parseList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Unified admin gate for /admin/api/* handlers. Accepts EITHER an allowlisted
// Subject (event.locals.user, set by hooks) OR the ADMIN_KEY break-glass
// `__Host-` cookie set by /admin/login. Returns the audit principal: the
// subject's UUID for a session, or the fixed 'admin-cookie' string for the
// break-glass path. Break-glass must be operational (not view-only) so
// KVKK/GDPR deletion and other ops still work when X OAuth is unavailable —
// this ORs the two paths the /admin layout already treats as equivalent.
export async function resolveAdmin(
  event: RequestEvent,
  env: { ADMIN_X_USER_IDS?: string; ADMIN_EMAILS?: string; ADMIN_KEY?: string }
): Promise<{ ok: true; adminId: string } | { ok: false }> {
  const user = event.locals.user;
  if (isAdmin(user, env.ADMIN_X_USER_IDS, env.ADMIN_EMAILS)) {
    return { ok: true, adminId: user!.id };
  }
  const cookie = event.cookies.get(ADMIN_COOKIE);
  if (env.ADMIN_KEY && cookie && (await verifyAdminCookie(env.ADMIN_KEY, cookie))) {
    return { ok: true, adminId: 'admin-cookie' };
  }
  return { ok: false };
}
