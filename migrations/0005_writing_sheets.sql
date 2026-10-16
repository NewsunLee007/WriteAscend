CREATE TABLE writing_sheet_sets (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES writing_tasks(id),
  member_id TEXT NOT NULL REFERENCES task_members(id), task_version INTEGER NOT NULL,
  draft_number INTEGER NOT NULL CHECK(draft_number BETWEEN 1 AND 20),
  page_count INTEGER NOT NULL CHECK(page_count BETWEEN 1 AND 4),
  template_version TEXT NOT NULL, layout_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','revoked')), created INTEGER NOT NULL
);
CREATE UNIQUE INDEX writing_sheet_active_draft ON writing_sheet_sets(task_id,member_id,draft_number) WHERE status='active';
CREATE INDEX writing_sheet_owner_task ON writing_sheet_sets(owner,task_id,id);
CREATE TABLE writing_sheets (
  id TEXT PRIMARY KEY, set_id TEXT NOT NULL REFERENCES writing_sheet_sets(id),
  page_number INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, check_code TEXT NOT NULL,
  UNIQUE(set_id,page_number)
);
CREATE INDEX writing_sheet_check_code ON writing_sheets(check_code);
CREATE TABLE writing_sheet_operations (
  owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL, committed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
  PRIMARY KEY(owner,request_id)
);
