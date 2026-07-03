import type { Cookies } from '@sveltejs/kit';

// __Host- prefix: browser-enforced Secure + path=/ + no Domain attribute.
// Referral capture cookie — first-touch, set once, read on every OAuth login.
export const REF_COOKIE = '__Host-zarf_early_ref';

// Crockford base32 alphabet WITHOUT the ambiguous glyphs I, L, O, U.
// 7 chars over a 32-symbol alphabet ≈ 35 bits of entropy — ample for a
// launch-scale waitlist while staying short/typo-resistant in a share URL.
export const REF_CODE_RE = /^[0-9A-HJ-NP-Z]{7}$/;

const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REF_CODE_LEN = 7;
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

// Generate a fresh referral code from crypto.getRandomValues. Rejection-free:
// the alphabet is exactly 32 symbols, so a 5-bit mask maps every random value
// onto a valid glyph with no modulo bias.
export function newReferralCode(): string {
  const bytes = new Uint8Array(REF_CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < REF_CODE_LEN; i++) {
    out += REF_ALPHABET[bytes[i] & 0x1f];
  }
  return out;
}

export function isValidRefCode(code: string | null | undefined): code is string {
  return typeof code === 'string' && REF_CODE_RE.test(code);
}

// Read a validated referral code from the request cookies, or null. Never
// returns an unvalidated value — a malformed/spoofed cookie is treated as
// absent so downstream lookups can't be poisoned.
export function readRefCookie(cookies: Cookies): string | null {
  const raw = cookies.get(REF_COOKIE);
  return isValidRefCode(raw) ? raw : null;
}

// FIRST-TOUCH: never overwrite an existing referral cookie. If a code is
// already present in the request, the earliest referrer wins and this is a
// no-op. httpOnly + secure + sameSite lax + path '/' + 30-day maxAge.
export function setRefCookie(cookies: Cookies, code: string): void {
  if (cookies.get(REF_COOKIE)) return; // first-touch — earliest referrer wins
  if (!isValidRefCode(code)) return;
  cookies.set(REF_COOKIE, code, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: REF_COOKIE_MAX_AGE
  });
}
