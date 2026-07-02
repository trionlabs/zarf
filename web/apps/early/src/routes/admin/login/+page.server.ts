import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { timingSafeEqual, signAdminCookie, ADMIN_COOKIE } from '$lib/server/session';
import { countAdminActionsSince, recordAuditEvent } from '$lib/server/audit';
import { logServerError, ERROR_CODES } from '$lib/server/errors';

const ADMIN_COOKIE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const THROTTLE_WINDOW_MS = 15 * 60 * 1000; // 15 min
const THROTTLE_MAX_FAILS = 8; // failures per IP per window before lockout

// Accept only printable ASCII (hex keys + similar). Reject control chars /
// non-ASCII before any comparison (SEC-7) so a weird payload can't probe timing.
const ASCII_PRINTABLE = /^[\x21-\x7e]+$/;

export const actions: Actions = {
  default: async (event) => {
    const env = event.platform?.env;
    if (!env) {
      return fail(500, { error: 'platform bindings missing' });
    }
    const adminKey = env.ADMIN_KEY;
    if (!adminKey) {
      logServerError('admin.login', ERROR_CODES.CONFIG_MISSING, { reason: 'ADMIN_KEY not set' });
      return fail(500, { error: 'admin login not configured' });
    }

    const ip = event.getClientAddress(); // CF-Connecting-IP (SEC-4)

    // Per-IP throttle: count recent failed attempts (admin_id = ip) and lock out.
    try {
      const fails = await countAdminActionsSince(
        env.DB,
        ip,
        'admin_login_fail',
        Date.now() - THROTTLE_WINDOW_MS
      );
      if (fails >= THROTTLE_MAX_FAILS) {
        return fail(429, { error: 'too many attempts; try again later' });
      }
    } catch (e) {
      logServerError('admin.login', ERROR_CODES.INTERNAL, e);
      return fail(500, { error: 'login failed' });
    }

    const form = await event.request.formData();
    const submitted = form.get('key');

    const recordFail = async () => {
      try {
        await recordAuditEvent(env.DB, {
          adminId: ip,
          action: 'admin_login_fail',
          ip,
          userAgent: event.request.headers.get('user-agent')
        });
      } catch (e) {
        logServerError('admin.login', ERROR_CODES.INTERNAL, e);
      }
    };

    if (typeof submitted !== 'string' || !ASCII_PRINTABLE.test(submitted)) {
      await recordFail();
      return fail(401, { error: 'invalid key' });
    }

    if (!timingSafeEqual(submitted, adminKey)) {
      await recordFail();
      return fail(401, { error: 'invalid key' });
    }

    // Match: set the signed __Host- admin cookie and bounce to /admin.
    event.cookies.set(ADMIN_COOKIE, await signAdminCookie(adminKey, ADMIN_COOKIE_TTL_MS), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/'
    });
    throw redirect(302, '/admin');
  }
};
