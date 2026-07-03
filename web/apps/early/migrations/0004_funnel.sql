-- Funnel expansion: 4-step waitlist (X login → follow → share post → wallet+email).
-- All new columns live on twitter_users (X-first funnel; email is a 4th-step column
-- write, not a new session kind). D1 does NOT support `ADD COLUMN ... UNIQUE`, so
-- uniqueness is enforced by separate partial unique indexes (SQLite allows multiple
-- NULLs under a partial index — the right shape for optional funnel fields).
ALTER TABLE twitter_users ADD COLUMN x_account_created_at INTEGER;
ALTER TABLE twitter_users ADD COLUMN x_followers_count    INTEGER;
ALTER TABLE twitter_users ADD COLUMN post_url             TEXT;
ALTER TABLE twitter_users ADD COLUMN post_id              TEXT;
ALTER TABLE twitter_users ADD COLUMN post_verified_at     INTEGER;
ALTER TABLE twitter_users ADD COLUMN post_verify_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE twitter_users ADD COLUMN post_verify_last_at  INTEGER;
ALTER TABLE twitter_users ADD COLUMN stellar_address      TEXT;   -- G... literal
ALTER TABLE twitter_users ADD COLUMN email                TEXT;   -- literal lowercase+trim (create.zarf.to leaf uyumu)
ALTER TABLE twitter_users ADD COLUMN wallet_email_at      INTEGER;
ALTER TABLE twitter_users ADD COLUMN wallet_submit_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE twitter_users ADD COLUMN wallet_submit_last_at INTEGER;
ALTER TABLE twitter_users ADD COLUMN completed_at         INTEGER;
ALTER TABLE twitter_users ADD COLUMN consent_at           INTEGER;  -- KVKK açık rıza (adım 4 checkbox)
ALTER TABLE twitter_users ADD COLUMN email_confirmed_at   INTEGER;  -- FAZ 2 SEAM (MVP'de HİÇBİR ŞEY yazmaz/okumaz — email infra yok!)
ALTER TABLE twitter_users ADD COLUMN referral_code        TEXT;     -- ilk login'de üretilir
ALTER TABLE twitter_users ADD COLUMN referred_by          TEXT;     -- referrer twitter_users.id, first-touch
ALTER TABLE twitter_users ADD COLUMN referral_count       INTEGER NOT NULL DEFAULT 0;
-- Faz 2 seam (nullable, şimdi eklemek bedava; prod ALTER+redeploy'dan kaçınır)
ALTER TABLE twitter_users ADD COLUMN wallet_sig_message   TEXT;
ALTER TABLE twitter_users ADD COLUMN wallet_sig           TEXT;
ALTER TABLE twitter_users ADD COLUMN wallet_sig_verified_at INTEGER;

CREATE UNIQUE INDEX idx_users_referral_code ON twitter_users(referral_code)   WHERE referral_code   IS NOT NULL;
CREATE UNIQUE INDEX idx_users_email         ON twitter_users(email)           WHERE email           IS NOT NULL;
CREATE UNIQUE INDEX idx_users_stellar       ON twitter_users(stellar_address) WHERE stellar_address IS NOT NULL;
CREATE UNIQUE INDEX idx_users_post_id       ON twitter_users(post_id)         WHERE post_id         IS NOT NULL;
CREATE INDEX idx_users_referred_by ON twitter_users(referred_by);
CREATE INDEX idx_users_completed   ON twitter_users(completed_at) WHERE completed_at IS NOT NULL;
