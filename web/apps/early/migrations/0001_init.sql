-- Consolidated baseline. Replaces the source app's 0001–0005: the cron_nonces
-- table (created then dropped in the source) is pure churn and omitted. sessions
-- is POLYMORPHIC from the start (no rebuild) with NO cross-table FK — D1 enforces
-- FKs by default and an enforced FK to twitter_users would block email-only
-- sessions. Integrity is enforced by CHECK + in app code.
CREATE TABLE twitter_users (
  id TEXT PRIMARY KEY,                     -- internal UUID
  x_user_id TEXT NOT NULL UNIQUE,          -- numeric X user id
  username TEXT NOT NULL,
  name TEXT,
  profile_image_url TEXT,
  created_at INTEGER NOT NULL,
  follow_attested_at INTEGER,
  follow_verified_at INTEGER,
  follow_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_seen_following_at INTEGER,
  follow_attest_count INTEGER NOT NULL DEFAULT 0,
  follow_attest_last_at INTEGER
);
CREATE INDEX idx_users_xid ON twitter_users(x_user_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('x','email')),
  x_user_id TEXT,                 -- = twitter_users.id (internal UUID) when 'x'; NO FK
  email_user_id TEXT,             -- = email_signups.id when 'email'; NO FK
  expires_at INTEGER NOT NULL,
  CHECK (
    (subject_kind='x'     AND x_user_id     IS NOT NULL AND email_user_id IS NULL) OR
    (subject_kind='email' AND email_user_id IS NOT NULL AND x_user_id     IS NULL)
  )
);
CREATE INDEX idx_sessions_x_user_id     ON sessions(x_user_id);
CREATE INDEX idx_sessions_email_user_id ON sessions(email_user_id);
