-- Eligibility split + points-board redesign ("instant-in + puan panosu").
--
-- The 0004 funnel treated `completed_at` as the single "you're in" flip: rank,
-- idempotency, stats, admin badge and the step machine all keyed off it. The
-- redesign separates two concerns that 0004 conflated:
--   1. QUEUE STANDING — compute-on-read points (see db.ts POINTS_SQL); no
--      materialized rank column, so weights stay tunable without a migration.
--   2. AIRDROP ELIGIBILITY — consent + at least one identity {email, address}.
-- `completed_at` is left FROZEN (8 divergent readers depend on its exact
-- semantics) and a NEW nullable `eligible_at` column records the first time a
-- row became airdrop-eligible. Live eligibility is DERIVED in SQL/JS (a user can
-- lose an identity via wallet reclaim); `eligible_at` is the immutable historical
-- first-flip and is the exactly-once trigger for referral credit (see
-- db.ts setEligibleIfUnset — first-write-wins, `changes === 1`).
--
-- All three columns are plain nullable / DEFAULT'd ADD COLUMNs. D1's
-- "no ADD COLUMN ... UNIQUE" limitation (worked around with partial indexes in
-- 0004) is NOT hit here — none of these need uniqueness. Adding the seams now is
-- free and avoids a prod ALTER+redeploy later.

-- First time the row became airdrop-eligible (consent_at + >=1 identity). NULL
-- until then; first-write-wins (never moves once set, even if an identity is
-- later reclaimed). See db.ts setEligibleIfUnset.
ALTER TABLE twitter_users ADD COLUMN eligible_at INTEGER;

-- Rate-limit counters for the new split email endpoint (POST /api/waitlist/email).
-- Mirrors wallet_submit_count / wallet_submit_last_at from 0004: NOT reset on
-- re-auth (upsertTwitterUser leaves them alone) so re-authenticating is not a
-- rate-limit bypass; the rolling window is the only recovery path.
ALTER TABLE twitter_users ADD COLUMN email_submit_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE twitter_users ADD COLUMN email_submit_last_at INTEGER;
