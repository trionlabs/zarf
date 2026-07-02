import type { Subject } from './db';

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
