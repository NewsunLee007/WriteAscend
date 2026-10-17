ALTER TABLE writing_integration_outbox ADD COLUMN error_code TEXT;
CREATE TABLE writing_integration_quarantine (
 draft_id TEXT PRIMARY KEY REFERENCES writing_drafts(id),
 remote_version INTEGER NOT NULL, reason TEXT NOT NULL,
 created INTEGER NOT NULL, updated INTEGER NOT NULL
);
