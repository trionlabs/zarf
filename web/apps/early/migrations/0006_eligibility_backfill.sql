-- Backfill eligible_at for rows completed under the RETIRED linear funnel.
--
-- The old /api/waitlist/complete required wallet + email + consent atomically,
-- so a completed_at row was, by construction, airdrop-eligible at that exact
-- moment — and its referrer was ALREADY credited by the old endpoint's
-- credit-on-completion path. Without this backfill those rows sit at
-- eligible_at IS NULL, and the first post-redesign write that re-derives
-- eligibility (e.g. POST /api/waitlist/consent's insurance flip) would flip
-- them fresh and credit the referrer a SECOND time. Stamping
-- eligible_at = completed_at preserves the exactly-once referral invariant
-- across the migration boundary and keeps launch-ordering timestamps honest.
--
-- Idempotent: the eligible_at IS NULL guard makes re-runs no-ops, and rows
-- created after the redesign never match (they have no completed_at).
UPDATE twitter_users
   SET eligible_at = completed_at
 WHERE completed_at IS NOT NULL
   AND eligible_at IS NULL;
