ALTER TABLE grading_runs ADD COLUMN work_permit_id TEXT;
ALTER TABLE grading_runs ADD COLUMN work_expires INTEGER;
ALTER TABLE model_jobs ADD COLUMN work_permit_id TEXT;
ALTER TABLE model_jobs ADD COLUMN work_expires INTEGER;
CREATE TABLE background_grant_revocations (
 grant_id TEXT PRIMARY KEY, created INTEGER NOT NULL, reason TEXT NOT NULL
);
