CREATE TABLE model_jobs (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, grant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('staging','queued','preparing','sending','succeeded','failed','uncertain')),
  request_key TEXT NOT NULL, result_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  dispatched_at INTEGER NOT NULL DEFAULT 0,
  error_status INTEGER, error_message TEXT,
  created INTEGER NOT NULL, updated INTEGER NOT NULL,
  UNIQUE(owner,request_id)
);
CREATE INDEX model_jobs_owner_time ON model_jobs(owner,created);
CREATE INDEX model_jobs_outbox ON model_jobs(state,dispatched_at);
