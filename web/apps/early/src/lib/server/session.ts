import type { Cookies } from '@sveltejs/kit';

// __Host- prefix is a browser-enforced contract: the cookie MUST be Secure,
// MUST have path=/, and MUST NOT have a Domain attribute. This blocks any
// subdomain from setting or reading the cookie and prevents the cookie from
// leaking to non-TLS origins. Most secure session cookie name available.
export const SESSION_COOKIE = '__Host-zarf_early_session';

// Handoff decision 12: Session cookie max-age ~ 7 days (pact-demo used 30, we use 7 to mirror handoff section 10 point 12)
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function setSessionCookie(cookies: Cookies, sessionId: string): void {
  cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  // __Host- prefix requires Secure on every Set-Cookie, including deletion.
  // Mirroring the set attributes ensures the browser actually drops the cookie
  // instead of silently rejecting the delete header.
  cookies.delete(SESSION_COOKIE, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
}

export function readSessionCookie(cookies: Cookies): string | null {
  return cookies.get(SESSION_COOKIE) ?? null;
}

// Constant-time string comparison for ASCII inputs (OAuth state, HMAC hex,
// session ids, etc.). Walks the LONGER input and pads the shorter side with
// NUL via the index guard — a naive Math.min walk leaks the shorter
// length via timing (loop iteration count). Length mismatch is XOR-folded
// into the diff accumulator so it costs the same as a content mismatch.
//
// Both inputs must be single-byte (ASCII) — charCodeAt yields UTF-16 code
// units, which collapse to byte values for ASCII. Do not pass arbitrary
// UTF-8 strings without re-encoding to bytes first.
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

// ─── Admin cookie (M1) ─────────────────────────────────────────────────
//
// The email-mode admin gate is a separate signed `__Host-`-prefixed cookie set
// by /admin/login (NOT a sessions-table row — it's orthogonal to the two-kind
// sessions CHECK). Same `__Host-` browser contract as the session cookie:
// single-quoted literal placeholder so the build never interpolates COOKIE_SLUG.
export const ADMIN_COOKIE = '__Host-zarf_early_admin';

const encoder = new TextEncoder();

async function hmacHex(adminKey: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(adminKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Mint the cookie value `${expiry}.${mac}` where mac = HMAC-SHA256(adminKey,
// String(expiry)). No nonce — the cookie is replayable until expiry, which is
// acceptable for a single-operator admin with a short TTL and `__Host-` origin
// pinning. Rotating ADMIN_KEY invalidates every outstanding admin cookie.
export async function signAdminCookie(adminKey: string, ttlMs: number): Promise<string> {
  const expiry = Date.now() + ttlMs;
  const mac = await hmacHex(adminKey, String(expiry));
  return `${expiry}.${mac}`;
}

// Verify a cookie value: split on the LAST '.', recompute the mac, constant-time
// compare, and require the expiry to be in the future.
export async function verifyAdminCookie(adminKey: string, value: string): Promise<boolean> {
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return false;
  const expiryStr = value.slice(0, dot);
  const providedMac = value.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry)) return false;
  const expectedMac = await hmacHex(adminKey, expiryStr);
  return timingSafeEqual(expectedMac, providedMac) && expiry > Date.now();
}
