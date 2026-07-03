import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAdmin } from '$lib/server/admin';
import { verifyAdminCookie, ADMIN_COOKIE } from '$lib/server/session';

// Guard the entire /admin/* subtree. The admin-cookie check runs FIRST and is
// orthogonal to isAdmin(Subject): the M1 `__Host-` admin cookie is the primary
// email-mode entry, set by /admin/login; the Subject allowlist is secondary.
// Cache-Control prevents any edge/browser/proxy from holding admin PII.
export const load: LayoutServerLoad = async (event) => {
  event.setHeaders({ 'cache-control': 'private, no-store' });

  // /admin/login is the only public node in the subtree — never guard it (would
  // otherwise loop: guard → redirect to /admin/login → guard → …).
  if (event.url.pathname === '/admin/login') {
    return { admin: null };
  }

  const env = event.platform?.env;

  // 1. Admin-cookie path (ADMIN_KEY) — no Subject required.
  const adminCookie = event.cookies.get(ADMIN_COOKIE);
  if (env?.ADMIN_KEY && adminCookie && (await verifyAdminCookie(env.ADMIN_KEY, adminCookie))) {
    return { admin: { via: 'key' as const } };
  }

  // 2. Secondary path: an X-kind or email-kind subject on the allowlist.
  const user = event.locals.user;
  if (!user) {
    throw redirect(302, '/admin/login');
  }
  if (!isAdmin(user, env?.ADMIN_X_USER_IDS, env?.ADMIN_EMAILS)) {
    throw error(403, 'Forbidden');
  }
  return {
    admin: {
      via: user.kind,
      username: user.kind === 'x' ? user.username : undefined
    }
  };
};
