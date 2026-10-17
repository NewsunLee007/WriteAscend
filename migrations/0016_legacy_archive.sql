-- Keep the original six-column import table compatible with older Workers.
CREATE TABLE legacy_import_state (
  batch_id TEXT PRIMARY KEY REFERENCES legacy_import_batches(id),
  owner TEXT NOT NULL, label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','complete','withdrawn')),
  processed_count INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  lease_key TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  updated TEXT NOT NULL
);
CREATE INDEX legacy_state_owner ON legacy_import_state(owner,status,updated);
CREATE TABLE legacy_import_members (
  batch_id TEXT NOT NULL REFERENCES legacy_import_batches(id),
  report_id TEXT NOT NULL REFERENCES private_reports(id),
  owner TEXT NOT NULL, position INTEGER NOT NULL,
  PRIMARY KEY(batch_id,position), UNIQUE(batch_id,report_id)
);
CREATE INDEX legacy_members_report ON legacy_import_members(report_id,batch_id);
