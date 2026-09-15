CREATE TABLE IF NOT EXISTS portal_sessions (
 id text PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('login','session')),
 payload text NOT NULL,
 expires_at timestamptz NOT NULL,
 last_seen timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_sessions_expiry ON portal_sessions(expires_at);
