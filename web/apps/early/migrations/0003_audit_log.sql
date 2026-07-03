CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,         -- crypto.randomUUID()
  admin_id    TEXT NOT NULL,            -- twitter_users.id of the admin who acted
  action      TEXT NOT NULL,            -- 'export_csv' | 'manual_verify'
  target_id   TEXT,                     -- twitter_users.id being acted on (nullable)
  ip          TEXT,                     -- Cf-Connecting-IP, truncated to 64 chars
  user_agent  TEXT,                     -- truncated to 256 chars
  detail_json TEXT,                     -- small JSON blob <= 1 KB
  created_at  INTEGER NOT NULL          -- unix ms
);
CREATE INDEX idx_audit_admin_ts ON audit_log(admin_id, created_at DESC);
CREATE INDEX idx_audit_action_ts ON audit_log(action, created_at DESC);
