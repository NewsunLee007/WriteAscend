CREATE TABLE writing_peer_exports (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES writing_tasks(id),
 task_revision INTEGER NOT NULL, task_version INTEGER NOT NULL, rubric_hash TEXT NOT NULL,
 class_id TEXT NOT NULL, class_version INTEGER NOT NULL, grant_version INTEGER NOT NULL,
 target_origin TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 content_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('active','revoked')), created INTEGER NOT NULL, revoked INTEGER,
 UNIQUE(owner,request_id)
);
CREATE INDEX writing_peer_exports_task ON writing_peer_exports(owner,task_id,created);
CREATE TABLE writing_peer_export_receipts (
 export_id TEXT PRIMARY KEY REFERENCES writing_peer_exports(id), receipt_id TEXT NOT NULL UNIQUE,
 content_hash TEXT NOT NULL, target_origin TEXT NOT NULL, created INTEGER NOT NULL
);
