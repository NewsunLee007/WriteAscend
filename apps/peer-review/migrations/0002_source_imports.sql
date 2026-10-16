CREATE TABLE peer_source_imports (
 id TEXT PRIMARY KEY, source_origin TEXT NOT NULL, export_id TEXT NOT NULL,
 owner TEXT NOT NULL, class_id TEXT NOT NULL, class_version INTEGER NOT NULL,
 grant_version INTEGER NOT NULL, content_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
 receipt_id TEXT NOT NULL UNIQUE, receipt_state TEXT NOT NULL CHECK(receipt_state IN('pending','acknowledged')),
 created INTEGER NOT NULL, acknowledged INTEGER,
 UNIQUE(source_origin,export_id)
);
CREATE INDEX peer_source_imports_owner ON peer_source_imports(owner,created,id);
