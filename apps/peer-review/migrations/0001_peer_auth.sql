CREATE TABLE peer_auth_transactions (
 token_hash TEXT PRIMARY KEY, state_hash TEXT NOT NULL, verifier TEXT NOT NULL,
 next_path TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0 CHECK(used IN(0,1)),
 expires INTEGER NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX peer_auth_transactions_expiry ON peer_auth_transactions(expires);
CREATE TABLE peer_app_sessions (
 token_hash TEXT PRIMARY KEY, login_hash TEXT NOT NULL UNIQUE,
 principal TEXT NOT NULL, grant_id TEXT NOT NULL, provider TEXT NOT NULL, subject TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN('teacher','admin','student')), expires INTEGER NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX peer_sessions_expiry ON peer_app_sessions(expires);
