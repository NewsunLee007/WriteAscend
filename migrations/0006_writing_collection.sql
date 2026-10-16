CREATE TABLE writing_submissions (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES writing_tasks(id),
  member_id TEXT NOT NULL REFERENCES task_members(id), created INTEGER NOT NULL,
  UNIQUE(task_id,member_id)
);
CREATE TABLE writing_drafts (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES writing_submissions(id),
  draft_number INTEGER NOT NULL, task_version INTEGER NOT NULL, rubric_hash TEXT NOT NULL,
  page_count INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK(state IN ('collecting','received')), input_hash TEXT NOT NULL,
  created INTEGER NOT NULL, updated INTEGER NOT NULL,
  UNIQUE(submission_id,draft_number)
);
CREATE TABLE submission_page_versions (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, draft_id TEXT NOT NULL REFERENCES writing_drafts(id),
  page_number INTEGER NOT NULL, revision INTEGER NOT NULL,
  asset_id TEXT NOT NULL REFERENCES private_assets(id), sha256 TEXT NOT NULL,
  sheet_id TEXT REFERENCES writing_sheets(id), detected_sheet_id TEXT REFERENCES writing_sheets(id),
  identity_method TEXT NOT NULL CHECK(identity_method IN ('qr','manual')), identity_note TEXT NOT NULL,
  file_name TEXT NOT NULL, confirmed_by TEXT NOT NULL, created INTEGER NOT NULL,
  UNIQUE(draft_id,page_number,revision)
);
CREATE TABLE writing_draft_inputs (
  draft_id TEXT NOT NULL REFERENCES writing_drafts(id), revision INTEGER NOT NULL,
  input_hash TEXT NOT NULL, manifest_json TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(draft_id,revision)
);
CREATE TABLE writing_page_claims (
  owner TEXT NOT NULL, sha256 TEXT NOT NULL, draft_id TEXT NOT NULL REFERENCES writing_drafts(id),
  page_number INTEGER NOT NULL, PRIMARY KEY(owner,sha256), UNIQUE(draft_id,page_number)
);
CREATE TABLE writing_collection_operations (
  owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  task_id TEXT NOT NULL, member_id TEXT NOT NULL, result_json TEXT NOT NULL,
  committed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
  PRIMARY KEY(owner,request_id)
);
CREATE INDEX writing_submissions_owner_task ON writing_submissions(owner,task_id,member_id);
