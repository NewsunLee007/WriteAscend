PRAGMA foreign_keys = ON;

CREATE TABLE auth_transactions (
  id_hash TEXT PRIMARY KEY, state TEXT NOT NULL, verifier TEXT NOT NULL,
  next_path TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE app_sessions (
  token_hash TEXT PRIMARY KEY, principal TEXT NOT NULL, grant_id TEXT NOT NULL,
  provider TEXT NOT NULL, subject TEXT NOT NULL, role TEXT NOT NULL,
  display_name TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON app_sessions(expires);
CREATE TABLE legacy_import_batches (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL,
  report_count INTEGER NOT NULL, archive_key TEXT NOT NULL, created TEXT NOT NULL,
  UNIQUE(owner,fingerprint)
);
CREATE TABLE private_reports (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL,
  payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  created TEXT NOT NULL, updated TEXT NOT NULL,
  UNIQUE(owner,fingerprint)
);
CREATE INDEX reports_owner_updated ON private_reports(owner,updated);
CREATE TABLE private_report_revisions (
  report_id TEXT NOT NULL REFERENCES private_reports(id), owner TEXT NOT NULL,
  revision INTEGER NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL,
  PRIMARY KEY(report_id,revision)
);
CREATE TABLE workspace_audit (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
  target TEXT NOT NULL, created TEXT NOT NULL
);
