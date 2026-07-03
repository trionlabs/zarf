-- Email base gate. Independent of twitter_users so an email-only deployment needs
-- ZERO X columns. email_norm is the dedupe key (single UNIQUE, no redundant index).
CREATE TABLE email_signups (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_norm    TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL,
  confirmed_at  INTEGER,
  confirm_token TEXT,
  x_user_id     TEXT,   -- linked in email+x mode after X login (= twitter_users.x_user_id)
  source        TEXT,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX idx_email_signups_created ON email_signups(created_at DESC);
