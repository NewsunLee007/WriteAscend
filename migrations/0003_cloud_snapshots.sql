CREATE TABLE private_assets (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
  UNIQUE(owner,sha256)
);
CREATE TABLE teacher_snapshots (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, local_id TEXT NOT NULL,
  name TEXT NOT NULL, class_name TEXT NOT NULL, graded_count INTEGER NOT NULL,
  revision INTEGER NOT NULL, content_hash TEXT NOT NULL, object_key TEXT NOT NULL,
  rubric_hash TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0, UNIQUE(owner,local_id)
);
CREATE INDEX teacher_snapshots_owner ON teacher_snapshots(owner,deleted,updated,id);
CREATE TABLE teacher_snapshot_versions (
  snapshot_id TEXT NOT NULL REFERENCES teacher_snapshots(id), revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL, object_key TEXT NOT NULL, rubric_hash TEXT NOT NULL,
  created INTEGER NOT NULL, PRIMARY KEY(snapshot_id,revision)
);
CREATE TABLE teacher_snapshot_operations (
  owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  snapshot_id TEXT NOT NULL, revision INTEGER NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(owner,request_id)
);
