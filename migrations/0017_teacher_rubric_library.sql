CREATE TABLE teacher_rubric_templates (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, genre TEXT NOT NULL,
 grade TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','archived')), document_json TEXT NOT NULL,
 created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX teacher_rubric_owner ON teacher_rubric_templates(owner,status,favorite,updated);
CREATE TABLE teacher_rubric_versions (
 template_id TEXT NOT NULL REFERENCES teacher_rubric_templates(id), revision INTEGER NOT NULL,
 metadata_json TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(template_id,revision)
);
CREATE TABLE teacher_rubric_operations (
 owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 result_json TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(owner,request_id)
);
