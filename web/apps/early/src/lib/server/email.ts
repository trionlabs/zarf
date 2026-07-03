// Email normalization + validation for the base gate.
//
// Dedup caveat: normalizeEmail is trim+lowercase only — it does NOT canonicalize
// Gmail plus/dot addressing, so `a+x@gmail.com` and `a@gmail.com` are distinct
// rows. Accepted explicitly for a waitlist (no auth value). Any future
// EMAIL_CONFIRM path must not branch observably on whether a row already exists
// (dedupe stays success-shaped → enumeration-safe).
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export function isValidEmail(e: string): boolean {
  return e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}
