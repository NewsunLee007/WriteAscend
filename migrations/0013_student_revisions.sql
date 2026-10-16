CREATE TABLE student_revision_workspaces (
 id TEXT PRIMARY KEY, student_principal TEXT NOT NULL, teacher_owner TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES writing_tasks(id), member_id TEXT NOT NULL REFERENCES task_members(id),
 submission_id TEXT NOT NULL REFERENCES writing_submissions(id), parent_draft_id TEXT NOT NULL REFERENCES writing_drafts(id),
 parent_publication_version INTEGER NOT NULL, parent_input_hash TEXT NOT NULL,
 draft_number INTEGER NOT NULL, task_version INTEGER NOT NULL, rubric_hash TEXT NOT NULL,
 revision INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('draft','submitted','returned','accepted')),
 content_json TEXT NOT NULL, content_hash TEXT NOT NULL, teacher_note TEXT NOT NULL,
 accepted_draft_id TEXT REFERENCES writing_drafts(id), created INTEGER NOT NULL, updated INTEGER NOT NULL,
 UNIQUE(submission_id,draft_number)
);
CREATE INDEX student_revisions_own ON student_revision_workspaces(student_principal,updated,id);
CREATE INDEX student_revisions_teacher ON student_revision_workspaces(teacher_owner,task_id,updated,id);
CREATE TABLE student_revision_versions (
 workspace_id TEXT NOT NULL REFERENCES student_revision_workspaces(id), revision INTEGER NOT NULL,
 state TEXT NOT NULL, content_json TEXT NOT NULL, content_hash TEXT NOT NULL,
 parent_publication_version INTEGER NOT NULL, actor TEXT NOT NULL, note TEXT NOT NULL, created INTEGER NOT NULL,
 PRIMARY KEY(workspace_id,revision)
);
CREATE TABLE student_revision_operations (
 principal TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 workspace_id TEXT NOT NULL, result_json TEXT NOT NULL, created INTEGER NOT NULL,
 PRIMARY KEY(principal,request_id)
);
CREATE TABLE student_revision_uploads (
 principal TEXT NOT NULL, request_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES student_revision_workspaces(id),
 sha256 TEXT NOT NULL, asset_id TEXT REFERENCES private_assets(id), created INTEGER NOT NULL,
 PRIMARY KEY(principal,request_id)
);
CREATE INDEX student_revision_upload_limit ON student_revision_uploads(principal,created);
