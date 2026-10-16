CREATE TABLE grading_runs (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, grant_id TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES writing_tasks(id), member_id TEXT NOT NULL REFERENCES task_members(id),
 submission_id TEXT NOT NULL REFERENCES writing_submissions(id), draft_id TEXT NOT NULL REFERENCES writing_drafts(id),
 input_revision INTEGER NOT NULL, input_hash TEXT NOT NULL, task_version INTEGER NOT NULL, rubric_hash TEXT NOT NULL,
 class_id TEXT NOT NULL, student_provider TEXT NOT NULL, student_subject TEXT NOT NULL,
 profile_id TEXT NOT NULL, profile_revision TEXT NOT NULL, model_name TEXT NOT NULL,
 model_images_json TEXT NOT NULL, model_input_hash TEXT NOT NULL,
 pipeline_version TEXT NOT NULL, temperature REAL NOT NULL, run_key TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
 previous_run_id TEXT UNIQUE REFERENCES grading_runs(id), reason TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL CHECK(state IN ('queued','running','ready','failed','uncertain','cancelled')),
 current_step_id TEXT, result_key TEXT, report_id TEXT,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 error_status INTEGER, error_message TEXT, dispatched_at INTEGER NOT NULL DEFAULT 0,
 created INTEGER NOT NULL, updated INTEGER NOT NULL,
 UNIQUE(owner,run_key,generation)
);
CREATE INDEX grading_runs_owner_task ON grading_runs(owner,task_id,updated,id);
CREATE INDEX grading_runs_recover ON grading_runs(state,lease_until,updated);
CREATE TABLE grading_steps (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES grading_runs(id),
 stage TEXT NOT NULL, base_stage TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1,
 previous_result_key TEXT, repair_content_key TEXT,
 job_id TEXT UNIQUE REFERENCES model_jobs(id), state TEXT NOT NULL CHECK(state IN ('queued','succeeded','failed','uncertain')),
 result_key TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL,
 UNIQUE(run_id,stage,attempt)
);
CREATE TABLE model_job_bindings (
 job_id TEXT PRIMARY KEY REFERENCES model_jobs(id), run_id TEXT NOT NULL REFERENCES grading_runs(id),
 step_id TEXT NOT NULL REFERENCES grading_steps(id), owner TEXT NOT NULL, class_id TEXT NOT NULL
);
CREATE INDEX model_job_bindings_run ON model_job_bindings(run_id);
CREATE TABLE grading_operations (
 owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 run_id TEXT NOT NULL REFERENCES grading_runs(id), action TEXT NOT NULL,
 created INTEGER NOT NULL, PRIMARY KEY(owner,request_id)
);
CREATE TABLE writing_reports (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES grading_runs(id), owner TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES writing_tasks(id), member_id TEXT NOT NULL REFERENCES task_members(id),
 draft_id TEXT NOT NULL REFERENCES writing_drafts(id), input_revision INTEGER NOT NULL, input_hash TEXT NOT NULL,
 rubric_hash TEXT NOT NULL, current_revision INTEGER NOT NULL,
 created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX writing_reports_owner_task ON writing_reports(owner,task_id,updated,id);
CREATE TABLE writing_report_revisions (
 report_id TEXT NOT NULL REFERENCES writing_reports(id), revision INTEGER NOT NULL,
 object_key TEXT NOT NULL, content_hash TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('ai','teacher')),
 actor TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
 PRIMARY KEY(report_id,revision)
);
