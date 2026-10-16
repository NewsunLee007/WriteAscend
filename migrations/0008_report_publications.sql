CREATE TABLE writing_publications (
 draft_id TEXT PRIMARY KEY REFERENCES writing_drafts(id), owner TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES writing_tasks(id), member_id TEXT NOT NULL REFERENCES task_members(id),
 class_id TEXT NOT NULL, student_provider TEXT NOT NULL, student_subject TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0), state TEXT NOT NULL CHECK(state IN ('published','withdrawn')),
 report_id TEXT NOT NULL REFERENCES writing_reports(id), report_revision INTEGER NOT NULL,
 input_hash TEXT NOT NULL, object_key TEXT NOT NULL, content_hash TEXT NOT NULL,
 summary_json TEXT NOT NULL, published_at INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX writing_publications_student ON writing_publications(student_provider,student_subject,state,published_at,draft_id);
CREATE TABLE writing_publication_versions (
 draft_id TEXT NOT NULL REFERENCES writing_publications(draft_id), version INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('published','withdrawn')), report_id TEXT NOT NULL REFERENCES writing_reports(id),
 report_revision INTEGER NOT NULL, input_hash TEXT NOT NULL, object_key TEXT NOT NULL, content_hash TEXT NOT NULL,
 actor TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', event_id TEXT NOT NULL UNIQUE, created INTEGER NOT NULL,
 PRIMARY KEY(draft_id,version)
);
CREATE TABLE writing_publication_operations (
 owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 draft_id TEXT NOT NULL REFERENCES writing_drafts(id), version INTEGER NOT NULL, event_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('publish','withdraw')), created INTEGER NOT NULL,
 PRIMARY KEY(owner,request_id)
);
CREATE TABLE writing_publication_reads (
 draft_id TEXT NOT NULL, version INTEGER NOT NULL, student_provider TEXT NOT NULL, student_subject TEXT NOT NULL,
 first_read INTEGER NOT NULL, last_read INTEGER NOT NULL,
 PRIMARY KEY(draft_id,version,student_provider,student_subject),
 FOREIGN KEY(draft_id,version) REFERENCES writing_publication_versions(draft_id,version)
);
CREATE TABLE writing_integration_outbox (
 id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES writing_drafts(id), version INTEGER NOT NULL,
 owner TEXT NOT NULL, grant_id TEXT NOT NULL, payload_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','blocked','superseded')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 last_error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL,
 UNIQUE(draft_id,version)
);
CREATE INDEX writing_integration_outbox_pending ON writing_integration_outbox(state,next_attempt_at,lease_until);
