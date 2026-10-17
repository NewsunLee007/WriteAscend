CREATE TABLE writing_tasks (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','open','closed')),
  revision INTEGER NOT NULL, current_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL, object_key TEXT NOT NULL, rubric_hash TEXT NOT NULL,
  targets_json TEXT NOT NULL, activation_request TEXT,
  member_count INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX writing_tasks_owner ON writing_tasks(owner,updated,id);
CREATE TABLE rubric_versions (
  task_id TEXT NOT NULL REFERENCES writing_tasks(id), version INTEGER NOT NULL,
  content_hash TEXT NOT NULL, rubric_hash TEXT NOT NULL, object_key TEXT NOT NULL,
  created INTEGER NOT NULL, PRIMARY KEY(task_id,version)
);
CREATE TABLE writing_task_operations (
  owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES writing_tasks(id), revision INTEGER NOT NULL,
  created INTEGER NOT NULL, PRIMARY KEY(owner,request_id)
);
CREATE TABLE task_members (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES writing_tasks(id),
  task_version INTEGER NOT NULL, provider TEXT NOT NULL, subject TEXT NOT NULL,
  name TEXT NOT NULL, class_id TEXT NOT NULL, class_name TEXT NOT NULL,
  school_id TEXT NOT NULL, academic_year TEXT NOT NULL, grade TEXT NOT NULL,
  source_version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', created INTEGER NOT NULL,
  UNIQUE(task_id,provider,subject)
);
CREATE INDEX task_members_page ON task_members(task_id,id);
