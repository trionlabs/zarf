import type { RequestHandler } from './$types';
import { resolveGateMode, gateAllowsEmail } from '$lib/server/gate';
import { isValidEmail, normalizeEmail } from '$lib/server/email';
import { insertEmailSignup, countSignupsByIpSince } from '$lib/server/db';
import { apiOk, apiError, ERROR_CODES, logServerError } from '$lib/server/errors';

export const prerender = false;

const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SIGNUP_MAX_PER_WINDOW = 10;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }
  // FIRST guard: email capture is 404 in any mode that doesn't allow email, so
  // an x-follow-only deploy presents no email surface (never 500).
  if (!gateAllowsEmail(resolveGateMode(env))) {
    return apiError(ERROR_CODES.FORBIDDEN, 404, 'email signup disabled');
  }
  // Origin-mismatch CSRF already enforced in hooks for /api/ POST.

  let body: { email?: string };
  try {
    body = await event.request.json();
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid json');
  }

  const email = normalizeEmail(body.email ?? '');
  if (!isValidEmail(email)) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid email');
  }

  const ip = event.getClientAddress(); // CF-Connecting-IP (SEC-4), never XFF.
  // Count-then-insert is racy (a burst can slip a few past the cap) and IPv6
  // rotation bypasses per-exact-IP counting. ACCEPTED RISK (SEC-4): bounded by
  // UNIQUE(email_norm) + ON CONFLICT DO NOTHING (no duplicate-row growth).
  // Escalation trigger: KV token-bucket or Turnstile if email-bombing is real.
  try {
    const recent = await countSignupsByIpSince(env.DB, ip, Date.now() - SIGNUP_WINDOW_MS);
    if (recent >= SIGNUP_MAX_PER_WINDOW) {
      return apiError(ERROR_CODES.RATE_LIMITED, 429, 'too many signups');
    }
  } catch (e) {
    logServerError('waitlist.signup', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'signup failed');
  }

  try {
    await insertEmailSignup(env.DB, {
      email, // email_norm computed inside insertEmailSignup
      ip,
      userAgent: event.request.headers.get('user-agent')?.slice(0, 256) ?? null,
      source: 'web'
    }); // ON CONFLICT(email_norm) DO NOTHING
  } catch (e) {
    logServerError('waitlist.signup', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'signup failed');
  }

  return apiOk({ ok: true }); // dedupe is success-shaped (enumeration-safe)
};
