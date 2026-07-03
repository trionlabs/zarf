// ─── Client-side quest metadata ─────────────────────────────────────────────
//
// Point weights MIRRORED from the server source of truth:
//   web/apps/early/src/lib/server/db.ts → POINTS_FOLLOW / POINTS_POST /
//   POINTS_EMAIL / POINTS_WALLET_VERIFIED / POINTS_WALLET_PASTED /
//   POINTS_REFERRAL_EACH / REFERRAL_CAP.
//
// The client CANNOT import the server module (it pulls D1 / server-only code),
// so these are hardcoded copies. If you change a weight in db.ts, change it here
// too — these numbers are display-only (the server recomputes authoritatively),
// but a divergence would show the user the wrong reward.
export const POINTS = {
  follow: 10, // POINTS_FOLLOW
  post: 20, // POINTS_POST
  email: 20, // POINTS_EMAIL
  walletVerified: 40, // POINTS_WALLET_VERIFIED
  walletPasted: 15, // POINTS_WALLET_PASTED
  referralEach: 15 // POINTS_REFERRAL_EACH
} as const;

export const REFERRAL_CAP = 10; // REFERRAL_CAP

// Derived wallet-connect bonus: what a verified signature adds on top of a
// pasted address (drives the "connect to earn +N more" upgrade copy).
export const WALLET_VERIFY_BONUS = POINTS.walletVerified - POINTS.walletPasted; // 25

// Wallet identity state, mirrored from the server flags:
//   verified → wallet_sig_verified_at set (ownership proven)
//   pasted   → stellar_address set, no signature
//   none     → no address at all
export type WalletState = 'none' | 'pasted' | 'verified';

// Eligibility strip state (consent + >=1 identity). DISTINCT states so the
// header can render a distinct message for each.
export type EligibilityState = 'eligible' | 'one_step' | 'consent';
