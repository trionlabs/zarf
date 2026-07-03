import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = false;

// ─── RETIRED ENDPOINT (410 Gone) ────────────────────────────────────────────
//
// The monolithic 4-step "complete" flip — wallet + email + consent + completion
// written in ONE conditional UPDATE — is retired by the funnel redesign. Its
// behaviour is split across three independent, idempotent endpoints, each of
// which handles its own rate-limit / consent gate / idempotent replay:
//   • POST /api/waitlist/consent  — record KVKK/GDPR consent (ConsentControl)
//   • POST /api/waitlist/email    — store the airdrop email identity (ZK rail)
//   • POST /api/waitlist/wallet   — store a pasted G-address (wallet-airdrop rail)
// (plus the wallet-challenge / wallet-verify pair for signature-proven wallets).
// Eligibility and the exactly-once referral credit now ride setEligibleIfUnset
// inside each identity endpoint, not a single all-or-nothing completion flip.
//
// The route file is KEPT (not deleted) purely for stability: a stale client that
// still POSTs here gets an unambiguous 410 Gone — "this endpoint is retired" —
// instead of a 404 it could confuse with a wrong-gate-mode miss. The 410 is
// returned UNCONDITIONALLY (no gate / session / body check) so the signal never
// depends on mode or auth state. `completeFunnel` stays in db.ts (deprecated) for
// reference / rollback only.
export const POST: RequestHandler = async () => {
  // Stable, greppable body shape. No new ERROR_CODES entry — errors.ts is owned
  // by another package and stays untouched; `gone` is a route-local literal.
  return json(
    { error: 'gone', message: 'endpoint retired; use /api/waitlist/{consent,email,wallet}' },
    { status: 410, headers: { 'Cache-Control': 'private, no-store' } }
  );
};
