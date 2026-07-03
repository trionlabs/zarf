import type { TwitterProfile } from './oauth';
import { normalizeEmail } from './email';
import { newReferralCode } from './referral';

export type TwitterUser = {
  id: string;
  x_user_id: string;
  username: string;
  name: string | null;
  profile_image_url: string | null;
  created_at: number;
  follow_attested_at: number | null;
  follow_verified_at: number | null;
  follow_attempt_count: number;
  // Legacy column from the Phase 3 decay design. The first-time-only verify
  // model dropped the decay loop, so this is no longer read or written.
  // Kept in the schema to avoid an ALTER TABLE; safe to drop in a later
  // migration if desired.
  last_seen_following_at: number | null;
  // User-side attest counters. Separate from follow_attempt_count (cron-side)
  // so attest rate-limiting and cron miss tracking don't collide.
  follow_attest_count: number;
  follow_attest_last_at: number | null;

  // ─── Funnel expansion (migration 0004) ──────────────────────────────
  // Sybil signals refreshed at every OAuth login.
  x_account_created_at: number | null; // unix ms parsed from X `created_at`
  x_followers_count: number | null;
  // Step 3: share-post verification (oEmbed). post_id has a partial UNIQUE
  // index — one tweet can only be claimed by one account.
  post_url: string | null;
  post_id: string | null;
  post_verified_at: number | null;
  // Per-endpoint rate-limit counters (NOT shared with follow_attest_*).
  post_verify_count: number;
  post_verify_last_at: number | null;
  // Step 4: wallet + email. Both have partial UNIQUE indexes.
  stellar_address: string | null; // G... literal
  email: string | null; // literal lowercase+trim (create.zarf.to leaf compat)
  wallet_email_at: number | null;
  wallet_submit_count: number;
  wallet_submit_last_at: number | null;
  completed_at: number | null; // FROZEN legacy flip; @deprecated — see eligible_at
  consent_at: number | null; // KVKK/GDPR explicit consent (ConsentControl checkbox)
  // Phase 2 seam — email double-opt-in. MVP writes/reads NOTHING here.
  email_confirmed_at: number | null;

  // ─── Eligibility split (migration 0005) ─────────────────────────────
  // First time the row became airdrop-eligible (consent + >=1 identity).
  // NULL until the first flip; first-write-wins (survives an identity reclaim).
  // Live eligibility is DERIVED (isEligible / POINTS_SQL guards); this is the
  // immutable historical timestamp + the exactly-once referral-credit trigger.
  eligible_at: number | null;
  // Per-endpoint rate-limit counters for the split email endpoint
  // (POST /api/waitlist/email). NOT shared with wallet_submit_*; NOT reset on
  // re-auth (no rate-limit bypass via re-authentication).
  email_submit_count: number;
  email_submit_last_at: number | null;
  // Referral graph.
  referral_code: string | null; // generated on first login (INSERT)
  referred_by: string | null; // referrer twitter_users.id, first-touch
  referral_count: number; // advisory materialized credit; authoritative recompute at export
  // Phase 2 seam — SEP-43 signMessage ownership boost.
  wallet_sig_message: string | null;
  wallet_sig: string | null;
  wallet_sig_verified_at: number | null;
};

// Email base-gate row (mirrors migrations/0002_email_signups.sql columns).
export type EmailSignup = {
  id: string;
  email: string;
  email_norm: string;
  created_at: number;
  confirmed_at: number | null;
  confirm_token: string | null;
  // Nullable; in email+x set to the X subject's numeric id when the SAME person
  // links X (the cross-table join key for dedup/counting).
  x_user_id: string | null;
  source: string | null;
  ip: string | null;
  user_agent: string | null;
};

// FLATTENED subject union (chosen to minimize accessor churn): after narrowing
// `subject.kind === 'x'`, field access is ONE level (subject.username,
// subject.id, subject.follow_attest_count) — never nested under an inner key.
export type Subject =
  | ({ kind: 'x' } & TwitterUser)
  | ({ kind: 'email' } & EmailSignup);

// ─── Points: the single source of truth ─────────────────────────────────
//
// Queue standing is compute-on-read: there is NO materialized points column, so
// these weights stay tunable without a migration. POINTS_SQL below is THE one
// expression every consumer must use (getQueueStanding, loadLaunchOrdering, and
// the admin/export recompute) — duplicating the arithmetic anywhere else is how
// rank and export silently diverge. Full-scan sort; fine at launch scale
// (<10k rows), documented so nobody "optimizes" it into a stale cache.
//
// Weights (tunable — edit here, everything downstream follows):
export const POINTS_FOLLOW = 10; // follow_attested_at NOT NULL (attest, not verified)
export const POINTS_POST = 20; // post_verified_at NOT NULL (share verified via oEmbed)
export const POINTS_EMAIL = 20; // email identity present
export const POINTS_WALLET_VERIFIED = 40; // signature-proven wallet ownership (biggest boost)
export const POINTS_WALLET_PASTED = 15; // pasted G-address, no ownership proof
export const POINTS_REFERRAL_EACH = 15; // per credited referral, up to the cap
export const REFERRAL_CAP = 10; // max credited referrals — anti ring-farming

// Points for one twitter_users row. Uses UNQUALIFIED column names, so it must be
// interpolated into a query whose (only) table is twitter_users — as a SELECT
// projection, a WHERE predicate, or an ORDER BY key. The wallet term is
// mutually exclusive: a verified wallet supersedes a pasted address, never both.
// The referral term is capped at REFERRAL_CAP before weighting.
export const POINTS_SQL = `(
    (CASE WHEN follow_attested_at     IS NOT NULL THEN ${POINTS_FOLLOW} ELSE 0 END)
  + (CASE WHEN post_verified_at       IS NOT NULL THEN ${POINTS_POST} ELSE 0 END)
  + (CASE WHEN email                  IS NOT NULL THEN ${POINTS_EMAIL} ELSE 0 END)
  + (CASE WHEN wallet_sig_verified_at IS NOT NULL THEN ${POINTS_WALLET_VERIFIED}
          WHEN stellar_address        IS NOT NULL THEN ${POINTS_WALLET_PASTED}
          ELSE 0 END)
  + (MIN(referral_count, ${REFERRAL_CAP}) * ${POINTS_REFERRAL_EACH})
)`;

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days in ms

// Resolve the polymorphic session subject. Selects subject_kind from a
// non-expired session, then JOINs the matching backing table by x_user_id
// (= twitter_users.id, internal UUID) or email_user_id (= email_signups.id),
// spreading the row + { kind } into a flat Subject. This is the sole session
// resolver — no caller may resolve an email session to null.
export async function getSubjectBySessionId(
  db: D1Database,
  sessionId: string
): Promise<Subject | null> {
  const now = Date.now();
  const session = await db
    .prepare(
      `SELECT subject_kind, x_user_id, email_user_id FROM sessions
        WHERE id = ?1 AND expires_at > ?2`
    )
    .bind(sessionId, now)
    .first<{ subject_kind: 'x' | 'email'; x_user_id: string | null; email_user_id: string | null }>();
  if (!session) return null;

  if (session.subject_kind === 'x') {
    if (!session.x_user_id) return null;
    const u = await db
      .prepare(`SELECT * FROM twitter_users WHERE id = ?1`)
      .bind(session.x_user_id)
      .first<TwitterUser>();
    return u ? { kind: 'x', ...u } : null;
  }

  if (!session.email_user_id) return null;
  const e = await db
    .prepare(`SELECT * FROM email_signups WHERE id = ?1`)
    .bind(session.email_user_id)
    .first<EmailSignup>();
  return e ? { kind: 'email', ...e } : null;
}

export async function getUserById(
  db: D1Database,
  userId: string
): Promise<TwitterUser | null> {
  const row = await db
    .prepare(`SELECT * FROM twitter_users WHERE id = ?1`)
    .bind(userId)
    .first<TwitterUser>();
  return row ?? null;
}

export async function findUserByTwitterId(
  db: D1Database,
  twitterId: string
): Promise<TwitterUser | null> {
  const row = await db
    .prepare(`SELECT * FROM twitter_users WHERE x_user_id = ?1`)
    .bind(twitterId)
    .first<TwitterUser>();
  return row ?? null;
}

// Parse X's `created_at` (ISO 8601) into unix ms, or null if absent/unparseable.
// Best-effort sybil signal — a bad value degrades to null, never throws.
function parseXAccountCreatedAt(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// Upsert on the numeric X id. Returns { user, isNew } — the isNew flag is the
// gate for INSERT-only referral capture in the OAuth callback (crediting a
// referrer on every re-auth would let organic signups retroactively pay a
// referrer). On INSERT we allocate a unique referral_code and record the sybil
// signals; on UPDATE we refresh username/name/avatar + sybil signals and reset
// the attest counter, but NEVER touch referral_code / completed_at / post_* /
// stellar_address / email — those are funnel state the login must not clobber.
export async function upsertTwitterUser(
  db: D1Database,
  profile: TwitterProfile
): Promise<{ user: TwitterUser; isNew: boolean }> {
  const existing = await findUserByTwitterId(db, profile.id);
  const now = Date.now();
  const followers = profile.followers_count ?? null;
  const accountCreatedAt = parseXAccountCreatedAt(profile.account_created_at);

  if (existing) {
    // Reset the user-side attest counter on every successful OAuth round trip.
    // This is the documented recovery path: a user who hits the attest
    // rate-limit gets told to re-authenticate. Re-auth lands here, the counter
    // goes to zero, and the next attest call goes through. follow_attempt_count
    // (cron-side miss count) is intentionally NOT reset — that's a different
    // signal and survives OAuth. The new post_verify_/wallet_submit_ counters
    // are ALSO intentionally not reset here (no rate-limit bypass via re-auth).
    await db
      .prepare(
        `UPDATE twitter_users
            SET username = ?1,
                name = ?2,
                profile_image_url = ?3,
                x_followers_count = ?4,
                x_account_created_at = ?5,
                follow_attest_count = 0,
                follow_attest_last_at = NULL
          WHERE id = ?6`
      )
      .bind(
        profile.username,
        profile.name ?? null,
        profile.avatar_url ?? null,
        followers,
        accountCreatedAt,
        existing.id
      )
      .run();
    const refreshed = await getUserById(db, existing.id);
    if (!refreshed) throw new Error('user vanished after update');
    return { user: refreshed, isNew: false };
  }

  const userId = crypto.randomUUID();
  // Allocate a referral_code with a bounded retry on the partial UNIQUE index.
  // A 7-char, 35-bit code makes a collision astronomically unlikely, but the
  // retry keeps signup deterministic. Only referral_code collisions retry; any
  // other constraint error (e.g. a concurrent insert racing x_user_id) throws.
  const MAX_REF_ATTEMPTS = 5;
  let inserted = false;
  for (let attempt = 0; attempt < MAX_REF_ATTEMPTS && !inserted; attempt++) {
    const referralCode = newReferralCode();
    try {
      await db
        .prepare(
          `INSERT INTO twitter_users (
             id, x_user_id, username, name, profile_image_url, created_at,
             follow_attempt_count, referral_code, x_followers_count, x_account_created_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9)`
        )
        .bind(
          userId,
          profile.id,
          profile.username,
          profile.name ?? null,
          profile.avatar_url ?? null,
          now,
          referralCode,
          followers,
          accountCreatedAt
        )
        .run();
      inserted = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Both "twitter_users.referral_code" and the index name
      // "idx_users_referral_code" contain this substring — either form retries.
      if (msg.includes('referral_code')) continue;
      throw e;
    }
  }
  if (!inserted) {
    throw new Error('failed to allocate a unique referral_code after retries');
  }

  const fresh = await getUserById(db, userId);
  if (!fresh) throw new Error('user vanished after insert');
  return { user: fresh, isNew: true };
}

// ─── Funnel: referral graph ─────────────────────────────────────────────

export async function findUserByReferralCode(
  db: D1Database,
  code: string
): Promise<TwitterUser | null> {
  const row = await db
    .prepare(`SELECT * FROM twitter_users WHERE referral_code = ?1`)
    .bind(code)
    .first<TwitterUser>();
  return row ?? null;
}

// First-touch, INSERT-only credit path: set referred_by only if still unset.
// Refuses self-referral defensively (the caller also pre-checks). The
// referral_count credit is a SEPARATE step (creditReferrer) fired only on a
// genuine completion — see completeFunnel.
export async function setReferredByIfUnset(
  db: D1Database,
  userId: string,
  referrerId: string
): Promise<void> {
  if (referrerId === userId) return; // never self-refer
  await db
    .prepare(`UPDATE twitter_users SET referred_by = ?1 WHERE id = ?2 AND referred_by IS NULL`)
    .bind(referrerId, userId)
    .run();
}

// ─── Funnel: step 3 (post verification) ─────────────────────────────────

// First-write-wins on post_verified_at (re-clicking never moves the clock);
// records the canonical URL + post id. The UNIQUE(post_id) partial index means
// a tweet already claimed by another account raises a D1 error here — the
// caller catches it and maps it to `post_already_used` (409). Not caught here:
// this function stays a thin data-layer primitive.
export async function markPostVerified(
  db: D1Database,
  userId: string,
  canonicalUrl: string,
  postId: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE twitter_users
          SET post_verified_at = COALESCE(post_verified_at, ?1),
              post_url = ?2,
              post_id = ?3
        WHERE id = ?4`
    )
    .bind(now, canonicalUrl, postId, userId)
    .run();
}

// Bump the post-verify rate-limit counter. Mirrors the follow_attest
// count-then-write pattern: the endpoint reads post_verify_count /
// post_verify_last_at off the loaded subject, enforces the 24h/10 window, then
// calls this on each attempt that actually consumed an oEmbed call. (An
// `oembed_unavailable` outcome must NOT call this — it doesn't burn the quota.)
export async function bumpPostVerifyCounter(
  db: D1Database,
  userId: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE twitter_users
          SET post_verify_count = post_verify_count + 1,
              post_verify_last_at = ?1
        WHERE id = ?2`
    )
    .bind(now, userId)
    .run();
}

// ─── Funnel: step 4 (wallet + email) ────────────────────────────────────

// Bump the wallet-submit rate-limit counter (mirror of bumpPostVerifyCounter).
export async function bumpWalletSubmitCounter(
  db: D1Database,
  userId: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE twitter_users
          SET wallet_submit_count = wallet_submit_count + 1,
              wallet_submit_last_at = ?1
        WHERE id = ?2`
    )
    .bind(now, userId)
    .run();
}

/**
 * @deprecated Legacy `completed_at`-based rank from the 4-step funnel. The
 * redesign moved to points-based standing — use {@link getQueueStanding}.
 * Retained only so the (soon-to-be-410'd) /api/waitlist/complete endpoint keeps
 * compiling until Package C retires it; do NOT wire new callers to this.
 *
 * Fixed queue rank. position = (# of completed rows strictly ahead) + 1, where
 * "ahead" = earlier completed_at, or same completed_at with a smaller id (the
 * id tiebreak keeps #N unique even for same-millisecond completions). Requires
 * a completed user; throws otherwise (a non-completed user has no rank).
 */
export async function getQueuePosition(
  db: D1Database,
  user: TwitterUser
): Promise<{ position: number; total: number }> {
  if (user.completed_at === null) {
    throw new Error('getQueuePosition requires a completed user');
  }
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM twitter_users
            WHERE completed_at IS NOT NULL
              AND (completed_at < ?1 OR (completed_at = ?1 AND id < ?2))) AS ahead,
         (SELECT COUNT(*) FROM twitter_users WHERE completed_at IS NOT NULL) AS total`
    )
    .bind(user.completed_at, user.id)
    .first<{ ahead: number; total: number }>();
  return { position: (row?.ahead ?? 0) + 1, total: row?.total ?? 0 };
}

// ─── Queue standing (points-based) + eligibility ────────────────────────

export type QueueStanding = {
  points: number; // this user's own points (POINTS_SQL, recomputed fresh)
  position: number | null; // rank among points>0 users; NULL when points === 0
  total: number; // count of X users with points > 0 (the ranked population)
};

// Points-based queue standing (replaces getQueuePosition). Ranking is over the
// X users with points > 0 ONLY — zero-point rows (bot inflation, drive-by
// logins) are unranked so they can't pollute #N; the UI shows "earn points to
// get ranked" for them. Order is (POINTS_SQL DESC, created_at ASC, id ASC):
// id is a random UUID (NOT time-sortable), so created_at is the real tiebreak
// and id is only the final deterministic disambiguator. position = (# of ranked
// rows strictly ahead) + 1. Everything derives from POINTS_SQL — same weights as
// export/launch-ordering, no divergence. Never throws for a non-ranked user.
export async function getQueueStanding(
  db: D1Database,
  user: TwitterUser
): Promise<QueueStanding> {
  // One round trip: `me` recomputes the caller's points via POINTS_SQL (fresh,
  // not trusting the possibly-stale loaded row), then `ahead` counts ranked rows
  // that sort strictly before the caller. created_at / id come from the loaded
  // row (immutable) and are reused for the tiebreak.
  const row = await db
    .prepare(
      `WITH me AS (SELECT ${POINTS_SQL} AS p FROM twitter_users WHERE id = ?1)
       SELECT
         (SELECT p FROM me) AS points,
         (SELECT COUNT(*) FROM twitter_users
            WHERE ${POINTS_SQL} > 0
              AND ( ${POINTS_SQL} > (SELECT p FROM me)
                    OR (${POINTS_SQL} = (SELECT p FROM me) AND created_at < ?2)
                    OR (${POINTS_SQL} = (SELECT p FROM me) AND created_at = ?2 AND id < ?1) )
         ) AS ahead,
         (SELECT COUNT(*) FROM twitter_users WHERE ${POINTS_SQL} > 0) AS total`
    )
    .bind(user.id, user.created_at)
    .first<{ points: number; ahead: number; total: number }>();

  const points = row?.points ?? 0;
  const total = row?.total ?? 0;
  // Zero-point users are unranked (position NULL) even though `ahead` is defined.
  const position = points > 0 ? (row?.ahead ?? 0) + 1 : null;
  return { points, position, total };
}

// Pure live-eligibility predicate: consent recorded AND at least one airdrop
// identity (email → ZK rail, or stellar_address → wallet-airdrop rail). This is
// DERIVED state — a user can lose an identity via a wallet reclaim and become
// ineligible again — which is why eligible_at (the historical first-flip) is a
// separate stored column, not a mirror of this.
export function isEligible(
  user: Pick<TwitterUser, 'consent_at' | 'email' | 'stellar_address'>
): boolean {
  return user.consent_at !== null && (user.email !== null || user.stellar_address !== null);
}

// Exactly-once eligibility flip. Stamps eligible_at = now ONLY on the first
// transition into the eligible set (consent + >=1 identity), gated by
// `eligible_at IS NULL`. flipped === true iff THIS call did the stamp — that is
// the exact trigger Package C uses to credit a referrer once (the direct port of
// the old complete-on-completion credit). Racing/repeat calls, or a call before
// the preconditions hold, return flipped === false. First-write-wins: a later
// identity reclaim never re-fires this.
export async function setEligibleIfUnset(
  db: D1Database,
  userId: string,
  now: number
): Promise<{ flipped: boolean }> {
  const res = await db
    .prepare(
      `UPDATE twitter_users
          SET eligible_at = ?1
        WHERE id = ?2
          AND eligible_at IS NULL
          AND consent_at IS NOT NULL
          AND (email IS NOT NULL OR stellar_address IS NOT NULL)`
    )
    .bind(now, userId)
    .run();
  return { flipped: res.meta.changes === 1 };
}

// First-write-wins consent (COALESCE, like markFollowAttested). The explicit
// KVKK/GDPR consent for storing an airdrop identity, written by ConsentControl
// (or implicitly on the first identity submit). Idempotent: re-consenting never
// moves the clock.
export async function writeConsent(
  db: D1Database,
  userId: string,
  now: number
): Promise<void> {
  await db
    .prepare(`UPDATE twitter_users SET consent_at = COALESCE(consent_at, ?1) WHERE id = ?2`)
    .bind(now, userId)
    .run();
}

// Write the airdrop email identity. FIRST-WRITE-WINS via `WHERE email IS NULL`:
// once set, the email is immutable through this path. This is deliberate — the
// exact literal string later becomes Zarf's ZK merkle leaf, so letting a user
// swap emails would silently orphan a leaf they can no longer claim. Caller must
// canonicalize (trim + lowercase) BEFORE calling; do NOT gmail dot/plus-fold
// (leaf compatibility). written === true iff this call set the email; false if
// the user already had one (no-op). A UNIQUE(email) collision with ANOTHER user
// raises a D1 error that propagates to the caller (→ email_taken 409); it is NOT
// caught here (thin data-layer primitive). The rate-limit counter is bumped
// separately by the endpoint (bumpEmailSubmitCounter).
export async function writeEmail(
  db: D1Database,
  userId: string,
  email: string,
  now: number
): Promise<{ written: boolean }> {
  const res = await db
    .prepare(
      `UPDATE twitter_users
          SET email = ?1,
              wallet_email_at = ?2
        WHERE id = ?3 AND email IS NULL`
    )
    .bind(email, now, userId)
    .run();
  return { written: res.meta.changes === 1 };
}

// Write a PASTED (unproven) G-address. Gated on `wallet_sig_verified_at IS NULL`
// so a paste can NEVER downgrade a signature-verified wallet — but a prior paste
// may be corrected (typo fix) by a later paste. written === true iff this call
// wrote the address. A UNIQUE(stellar_address) collision (address already held
// by another row, verified or not) raises a D1 error that propagates to the
// caller (→ wallet_taken 409); not caught here.
export async function writeWalletPaste(
  db: D1Database,
  userId: string,
  address: string,
  now: number
): Promise<{ written: boolean }> {
  const res = await db
    .prepare(
      `UPDATE twitter_users
          SET stellar_address = ?1
        WHERE id = ?2 AND wallet_sig_verified_at IS NULL`
    )
    .bind(address, userId)
    .run();
  return { written: res.meta.changes === 1 };
}

// Write a SIGNATURE-VERIFIED wallet, implementing the address-squatting reclaim
// rule. G-addresses are public, so an attacker can paste a victim's address to
// grab the UNIQUE(stellar_address) slot first. Rule: a verified signature
// RECLAIMS an address that is only held via unverified paste, but a
// verified-vs-VERIFIED collision must still fail (→ wallet_taken 409).
//
// Runs as a d1 batch (one transaction — both statements commit or neither):
//   1. Evict an UNVERIFIED squatter: null out the address on any OTHER row that
//      holds it via paste only (wallet_sig_verified_at IS NULL).
//   2. Set the claimant's address + signature material + verified timestamp.
// If the address is held VERIFIED by another row, step 1 evicts nothing, step 2
// hits the UNIQUE index, and the WHOLE batch rolls back with a D1 UNIQUE error
// that propagates to the caller — the squatter is NOT evicted on a failed claim.
// reclaimed === true iff a squatter row was evicted; written === true iff the
// claimant row was updated.
export async function writeWalletVerified(
  db: D1Database,
  userId: string,
  address: string,
  sigMessage: string,
  sig: string,
  now: number
): Promise<{ written: boolean; reclaimed: boolean }> {
  const results = await db.batch([
    db
      .prepare(
        `UPDATE twitter_users
            SET stellar_address = NULL,
                wallet_sig_message = NULL,
                wallet_sig = NULL,
                wallet_sig_verified_at = NULL
          WHERE stellar_address = ?1
            AND wallet_sig_verified_at IS NULL
            AND id != ?2`
      )
      .bind(address, userId),
    db
      .prepare(
        `UPDATE twitter_users
            SET stellar_address = ?1,
                wallet_sig_message = ?2,
                wallet_sig = ?3,
                wallet_sig_verified_at = ?4
          WHERE id = ?5`
      )
      .bind(address, sigMessage, sig, now, userId)
  ]);
  const reclaimed = (results[0]?.meta.changes ?? 0) > 0;
  const written = (results[1]?.meta.changes ?? 0) === 1;
  return { written, reclaimed };
}

// Bump the email-submit rate-limit counter (mirror of bumpWalletSubmitCounter
// for the split email endpoint's 0005 counters). NOT reset on re-auth.
export async function bumpEmailSubmitCounter(
  db: D1Database,
  userId: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE twitter_users
          SET email_submit_count = email_submit_count + 1,
              email_submit_last_at = ?1
        WHERE id = ?2`
    )
    .bind(now, userId)
    .run();
}

// @deprecated Retired by the redesign — the single all-or-nothing "step 4" flip
// (wallet + email + consent + completion in one UPDATE) is replaced by the
// independent writeEmail / writeWalletPaste / writeWalletVerified / writeConsent
// primitives plus setEligibleIfUnset. Package C retires the /api/waitlist/complete
// endpoint (410); this function stays for reference / rollback only. Do NOT wire
// new callers to it.
//
// Single conditional UPDATE — writes wallet/email/consent/completion in one
// shot, gated on completed_at IS NULL so a racing second request is a no-op.
// completed === true iff THIS call flipped the row. UNIQUE(email) /
// UNIQUE(stellar_address) collisions raise a D1 error the caller catches and
// maps to email_taken / wallet_taken (409). The referral credit is deliberately
// NOT batched in here (an unconditional batch double-credits under a race) —
// the caller calls creditReferrer only when completed === true AND referred_by
// is a real other user.
export async function completeFunnel(
  db: D1Database,
  userId: string,
  opts: { stellarAddress: string; email: string; now: number }
): Promise<{ completed: boolean }> {
  const res = await db
    .prepare(
      `UPDATE twitter_users
          SET stellar_address = ?1,
              email = ?2,
              wallet_email_at = ?3,
              consent_at = ?3,
              completed_at = ?3
        WHERE id = ?4 AND completed_at IS NULL`
    )
    .bind(opts.stellarAddress, opts.email, opts.now, userId)
    .run();
  return { completed: res.meta.changes === 1 };
}

// Materialize one referral credit on the referrer. Advisory only (the launch
// ordering recomputes authoritative counts at export time). Call ONLY after a
// completeFunnel that returned completed === true, and only when referred_by
// points at a real, different user.
export async function creditReferrer(db: D1Database, referrerId: string): Promise<void> {
  await db
    .prepare(`UPDATE twitter_users SET referral_count = referral_count + 1 WHERE id = ?1`)
    .bind(referrerId)
    .run();
}

// ─── Funnel: post re-verify sweep (admin) ───────────────────────────────

export type PostForReverify = {
  id: string;
  x_user_id: string;
  username: string;
  post_id: string;
  post_url: string;
};

export async function loadPostsForReverify(db: D1Database): Promise<PostForReverify[]> {
  const res = await db
    .prepare(
      `SELECT id, x_user_id, username, post_id, post_url FROM twitter_users
        WHERE post_verified_at IS NOT NULL`
    )
    .all<PostForReverify>();
  return res.results ?? [];
}

// Clear post_verified_at for the given users, in batches of 50 (mirrors
// bulkSetFollowVerified). Used by the admin re-verify sweep to revoke posts
// that no longer pass oEmbed (deleted / de-linked / author-mismatched).
export async function bulkClearPostVerified(db: D1Database, userIds: string[]): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const id of userIds) {
    stmts.push(
      db.prepare(`UPDATE twitter_users SET post_verified_at = NULL WHERE id = ?1`).bind(id)
    );
  }
  const CHUNK = 50;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    const slice = stmts.slice(i, i + CHUNK);
    if (slice.length > 0) {
      await db.batch(slice);
    }
  }
}

export async function markFollowAttested(
  db: D1Database,
  userId: string
): Promise<TwitterUser> {
  const now = Date.now();
  // First-write-wins on follow_attested_at: once a user has clicked "I followed"
  // the timestamp is fixed (re-clicking shouldn't move the clock backward or
  // forward). follow_attest_last_at + follow_attest_count are the rate-limit
  // counters — they advance on every call so the attest endpoint can detect
  // repeated taps without losing the original attest time.
  await db
    .prepare(
      `UPDATE twitter_users
          SET follow_attested_at = COALESCE(follow_attested_at, ?1),
              follow_attest_last_at = ?1,
              follow_attest_count = follow_attest_count + 1
        WHERE id = ?2`
    )
    .bind(now, userId)
    .run();
  const fresh = await getUserById(db, userId);
  if (!fresh) throw new Error('user vanished after attest');
  return fresh;
}

export type PendingForVerify = { id: string; x_user_id: string };

// Pending = attested but not yet verified. First-time-only semantics: once a
// user is verified, they stay verified. The cron-side decay loop that
// re-checked verified users on a 7-day window is intentionally removed —
// X API moved to pay-per-usage in 2026 ($0.001/owned follower-resource) so
// every recurring sweep scales linearly with @zarfto's follower count. The
// operator triggers a sweep manually when they want to process attested
// backlog (Workers & Pages → cron worker → Send Event, or wrangler cron
// trigger). last_seen_following_at column is preserved in the schema but
// no longer read; safe to drop in a later migration if desired.
export async function loadPendingForVerify(db: D1Database): Promise<PendingForVerify[]> {
  const res = await db
    .prepare(
      `SELECT id, x_user_id FROM twitter_users
        WHERE follow_attested_at IS NOT NULL
          AND follow_verified_at IS NULL`
    )
    .all<PendingForVerify>();
  return res.results ?? [];
}

export async function bulkSetFollowVerified(
  db: D1Database,
  verifiedIds: string[],
  unverifiedIds: string[]
): Promise<{ verifiedCount: number; rejectedCount: number }> {
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];

  // First-time-only model: every row reaching this branch has
  // follow_verified_at = NULL (loadPendingForVerify filter). Direct
  // assignment is safe; no COALESCE protection needed because there is
  // no re-verify path that could overwrite an earlier timestamp.
  for (const id of verifiedIds) {
    stmts.push(
      db
        .prepare(`UPDATE twitter_users SET follow_verified_at = ?1 WHERE id = ?2`)
        .bind(now, id)
    );
  }

  // User attested but isn't in the follower list. Bump the miss counter —
  // useful signal for detecting attest-without-follow bots. Don't touch
  // follow_verified_at (it's already NULL for everyone in this batch under
  // the first-time-only model).
  for (const id of unverifiedIds) {
    stmts.push(
      db
        .prepare(
          `UPDATE twitter_users
              SET follow_attempt_count = follow_attempt_count + 1
            WHERE id = ?1`
        )
        .bind(id)
    );
  }

  const CHUNK = 50;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    const slice = stmts.slice(i, i + CHUNK);
    if (slice.length > 0) {
      await db.batch(slice);
    }
  }

  return { verifiedCount: verifiedIds.length, rejectedCount: unverifiedIds.length };
}

// ─── Admin queries ─────────────────────────────────────────────────────

// Explicit column list (never SELECT *) so new funnel columns surface in admin.
// LIMIT defaults to 500 so existing callers need no change; admin can pass a
// higher bound if the list ever outgrows it (launch scale is well under this).
export async function loadAllUsers(
  db: D1Database,
  limit: number = 500
): Promise<TwitterUser[]> {
  const res = await db
    .prepare(
      `SELECT id, x_user_id, username, name, profile_image_url, created_at,
              follow_attested_at, follow_verified_at, follow_attempt_count,
              last_seen_following_at, follow_attest_count, follow_attest_last_at,
              x_account_created_at, x_followers_count,
              post_url, post_id, post_verified_at, post_verify_count, post_verify_last_at,
              stellar_address, email, wallet_email_at, wallet_submit_count, wallet_submit_last_at,
              completed_at, consent_at, email_confirmed_at,
              eligible_at, email_submit_count, email_submit_last_at,
              referral_code, referred_by, referral_count,
              wallet_sig_message, wallet_sig, wallet_sig_verified_at
         FROM twitter_users
        ORDER BY created_at DESC
        LIMIT ?1`
    )
    .bind(limit)
    .all<TwitterUser>();
  return res.results ?? [];
}

export type WaitlistStats = {
  total: number;
  attested: number;
  verified: number;
  postVerified: number;
  // FROZEN legacy count — rows that flipped the old 4-step completed_at. Kept
  // intact for regression parity; new dashboards should read `eligible`.
  completed: number;
  // LIVE airdrop-eligible count (consent + >=1 identity), derived the same way
  // as isEligible — NOT a count of the historical eligible_at stamp (a reclaim
  // can drop a row back out of the eligible set).
  eligible: number;
};

export async function getWaitlistStats(db: D1Database): Promise<WaitlistStats> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN follow_attested_at IS NOT NULL THEN 1 ELSE 0 END) AS attested,
         SUM(CASE WHEN follow_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified,
         SUM(CASE WHEN post_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS postVerified,
         SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN consent_at IS NOT NULL
                   AND (email IS NOT NULL OR stellar_address IS NOT NULL)
                  THEN 1 ELSE 0 END) AS eligible
       FROM twitter_users`
    )
    .first<{
      total: number;
      attested: number;
      verified: number;
      postVerified: number;
      completed: number;
      eligible: number;
    }>();
  return {
    total: row?.total ?? 0,
    attested: row?.attested ?? 0,
    verified: row?.verified ?? 0,
    postVerified: row?.postVerified ?? 0,
    completed: row?.completed ?? 0,
    eligible: row?.eligible ?? 0
  };
}

// ─── Launch-day ordering (points-based airdrop feed) ────────────────────

// One row of the authoritative launch feed. `points` is computed via POINTS_SQL
// (same weights as getQueueStanding), so the on-screen queue and the export
// agree. The sybil signals (x_followers_count, x_account_created_at,
// follow_attempt_count, follow_verified_at) travel with each row so Package E's
// export-time recompute can discount unverified follow attests and flag bots.
export type LaunchRow = {
  username: string;
  x_user_id: string;
  email: string | null;
  stellar_address: string | null;
  wallet_sig_verified_at: number | null;
  points: number;
  eligible_at: number | null;
  consent_at: number | null;
  referral_count: number;
  x_followers_count: number | null;
  x_account_created_at: number | null;
  follow_attempt_count: number;
  follow_verified_at: number | null;
};

// LIVE-eligible rows (consent + >=1 identity), ordered exactly like the queue:
// (POINTS_SQL DESC, created_at ASC, id ASC). Filter is the live derivation, not
// the eligible_at stamp, so a row that lost its only identity via reclaim drops
// out. Both rails are fed: an email-only row (ZK leaf) and an address-only row
// (wallet-airdrop leaf) both qualify. Full-scan sort — fine at launch scale;
// Package E consumes this for the CSV / airdrop feed.
export async function loadLaunchOrdering(db: D1Database): Promise<LaunchRow[]> {
  const res = await db
    .prepare(
      `SELECT username, x_user_id, email, stellar_address, wallet_sig_verified_at,
              ${POINTS_SQL} AS points, eligible_at, consent_at, referral_count,
              x_followers_count, x_account_created_at, follow_attempt_count,
              follow_verified_at
         FROM twitter_users
        WHERE consent_at IS NOT NULL
          AND (email IS NOT NULL OR stellar_address IS NOT NULL)
        ORDER BY ${POINTS_SQL} DESC, created_at ASC, id ASC`
    )
    .all<LaunchRow>();
  return res.results ?? [];
}

// Admin-initiated manual verification — bypasses the cron pipeline.
// Sets follow_verified_at AND ensures follow_attested_at is non-null so
// the user state machine doesn't get stuck.
//
// Prepared-statement form for atomic batching with an audit insert. Callers
// that need "either both rows land or neither" semantics should compose this
// with prepareAuditInsert via db.batch([...]).
export function prepareMarkFollowVerifiedManual(
  db: D1Database,
  userId: string,
  now: number = Date.now()
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE twitter_users
          SET follow_verified_at = ?1,
              follow_attested_at = COALESCE(follow_attested_at, ?1)
        WHERE id = ?2`
    )
    .bind(now, userId);
}

// Polymorphic session subject reference. `xUserId` = twitter_users.id (internal
// UUID) for an X session; `emailUserId` = email_signups.id for an email session.
export type SubjectRef = { kind: 'x'; xUserId: string } | { kind: 'email'; emailUserId: string };

export async function createSession(
  db: D1Database,
  subject: SubjectRef,
  expiresAt?: number
): Promise<{ id: string; expiresAt: number }> {
  // Generate random 32-byte hex for session ID
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const sessionId = Array.from(rawBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  const exp = expiresAt ?? Date.now() + SESSION_TTL_MS;

  // Write the matching id column; leave the other NULL. The table CHECK rejects
  // any malformed pair — no sentinel, ever.
  await db
    .prepare(
      `INSERT INTO sessions (id, subject_kind, x_user_id, email_user_id, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(
      sessionId,
      subject.kind,
      subject.kind === 'x' ? subject.xUserId : null,
      subject.kind === 'email' ? subject.emailUserId : null,
      exp
    )
    .run();
  return { id: sessionId, expiresAt: exp };
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(sessionId).run();
}

export async function rotateSession(
  db: D1Database,
  subject: SubjectRef,
  expiresAt?: number
): Promise<{ id: string; expiresAt: number }> {
  // Single-session-per-subject invariant: every prior session for this subject
  // is deleted before the new one is created. Deleting by the subject id (not by
  // the old session id) closes the gap where an attacker who hijacked the cookie
  // could keep a parallel session alive across rotations. Runs unconditionally —
  // if the legitimate user re-authenticates from a device with no cookie, any
  // other devices' sessions are still cleaned.
  //
  // X is the only live rotation path. The email branch is defined for symmetry
  // but unexercised in MVP: email signup is a one-shot capture, NOT a login, so
  // it never mints a session.
  if (subject.kind === 'x') {
    await db.prepare(`DELETE FROM sessions WHERE x_user_id = ?1`).bind(subject.xUserId).run();
  } else {
    await db.prepare(`DELETE FROM sessions WHERE email_user_id = ?1`).bind(subject.emailUserId).run();
  }
  return createSession(db, subject, expiresAt);
}

// ─── Email signups (base gate) ─────────────────────────────────────────

// Insert an email signup. Normalizes the dedupe key internally (the call site
// does not pass email_norm). ON CONFLICT(email_norm) DO NOTHING makes a repeat
// signup a no-op success — dedupe is success-shaped (enumeration-safe).
export async function insertEmailSignup(
  db: D1Database,
  input: { email: string; ip?: string | null; userAgent?: string | null; source?: string | null }
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO email_signups (id, email, email_norm, created_at, ip, user_agent, source)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(email_norm) DO NOTHING`
    )
    .bind(
      crypto.randomUUID(),
      input.email,
      normalizeEmail(input.email),
      now,
      input.ip ?? null,
      input.userAgent ?? null,
      input.source ?? null
    )
    .run();
}

export async function getEmailSignupById(
  db: D1Database,
  id: string
): Promise<EmailSignup | null> {
  const row = await db
    .prepare(`SELECT * FROM email_signups WHERE id = ?1`)
    .bind(id)
    .first<EmailSignup>();
  return row ?? null;
}

export async function getEmailSignupByNorm(
  db: D1Database,
  emailNorm: string
): Promise<EmailSignup | null> {
  const row = await db
    .prepare(`SELECT * FROM email_signups WHERE email_norm = ?1`)
    .bind(emailNorm)
    .first<EmailSignup>();
  return row ?? null;
}

// M3 cross-table link: attach an X id to an email_signups row so the same person
// counts once across admin stats + CSV (email+x mode only).
export async function linkEmailSignupToX(
  db: D1Database,
  emailUserId: string,
  xUserId: string
): Promise<void> {
  await db
    .prepare(`UPDATE email_signups SET x_user_id = ?2 WHERE id = ?1`)
    .bind(emailUserId, xUserId)
    .run();
}

export async function loadAllEmailSignups(db: D1Database): Promise<EmailSignup[]> {
  const res = await db
    .prepare(`SELECT * FROM email_signups ORDER BY created_at DESC`)
    .all<EmailSignup>();
  return res.results ?? [];
}

export type EmailStats = { total: number; confirmed: number };

export async function getEmailStats(db: D1Database): Promise<EmailStats> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmed
       FROM email_signups`
    )
    .first<{ total: number; confirmed: number }>();
  return { total: row?.total ?? 0, confirmed: row?.confirmed ?? 0 };
}

// Per-IP signup count in a rolling window. Mirrors countAdminActionsSince in
// audit.ts — inherently racy against concurrent inserts (count-then-insert
// TOCTOU), bounded by UNIQUE(email_norm) so no duplicate-row growth.
export async function countSignupsByIpSince(
  db: D1Database,
  ip: string,
  sinceMs: number
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM email_signups WHERE ip = ?1 AND created_at > ?2`)
    .bind(ip, sinceMs)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ─── WS4 addition: admin hard-delete (KVKK PII scrub) ───────────────────
//
// Delete a user's entire twitter_users row AND every session for that subject
// in ONE atomic db.batch (a single D1 transaction — either both land or
// neither). Backs POST /admin/api/delete-user. Added here because db.ts
// exported neither a twitter_users row-delete nor a delete-sessions-by-subject
// helper (deleteSession is by session id; rotateSession deletes by subject but
// is coupled to minting a replacement).
//
// Deleting the row (vs nulling PII columns) is deliberate: it also frees the
// email / stellar_address / post_id partial-UNIQUE slots. Sessions are keyed by
// x_user_id = twitter_users.id (the internal UUID — see SubjectRef), so the
// sessions delete uses the same userId. Other users' referred_by pointers to
// this id are intentionally left dangling: an internal UUID alone is not
// personal data, and the export-time referral recompute counts only completed
// rows, so a deleted referrer contributes nothing.
// Prepared-statement form so callers can compose the PII scrub with an audit
// insert in ONE db.batch — the KVKK delete trail then lands iff the delete
// commits (no mutate-then-audit gap on the most destructive action).
export function prepareDeleteUser(db: D1Database, userId: string): D1PreparedStatement[] {
  return [
    db.prepare(`DELETE FROM sessions WHERE x_user_id = ?1`).bind(userId),
    db.prepare(`DELETE FROM twitter_users WHERE id = ?1`).bind(userId)
  ];
}

export async function deleteUserById(db: D1Database, userId: string): Promise<void> {
  await db.batch(prepareDeleteUser(db, userId));
}
