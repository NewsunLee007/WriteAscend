CREATE TABLE peer_rounds (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, import_id TEXT NOT NULL REFERENCES peer_source_imports(id),
 source_hash TEXT NOT NULL, binding_hash TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 rubric_json TEXT NOT NULL, seed TEXT NOT NULL, allocation_hash TEXT NOT NULL, per_student INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN('reviewing','paused','closed')), revision INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
 UNIQUE(owner,request_id)
);
CREATE TABLE peer_round_people (
 id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES peer_rounds(id), member_id TEXT NOT NULL,
 provider TEXT NOT NULL, subject TEXT NOT NULL, material_id TEXT NOT NULL UNIQUE, alias TEXT NOT NULL,
 text TEXT NOT NULL, material_hash TEXT NOT NULL,
 UNIQUE(round_id,provider,subject), UNIQUE(round_id,alias)
);
CREATE INDEX peer_rounds_owner_created ON peer_rounds(owner,created,id);
CREATE INDEX peer_people_account ON peer_round_people(provider,subject,round_id);
CREATE TABLE peer_assignments (
 id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES peer_rounds(id), reviewer_id TEXT NOT NULL REFERENCES peer_round_people(id),
 author_id TEXT NOT NULL REFERENCES peer_round_people(id), material_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('assigned','submitted','returned','published','hidden')),
 revision INTEGER NOT NULL, review_revision INTEGER NOT NULL DEFAULT 0, draft_json TEXT,
 review_hash TEXT, moderation_note TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL,
 CHECK(reviewer_id<>author_id), UNIQUE(round_id,reviewer_id,author_id)
);
CREATE INDEX peer_assignments_round ON peer_assignments(round_id,reviewer_id,id);
CREATE TABLE peer_review_versions (
 assignment_id TEXT NOT NULL REFERENCES peer_assignments(id), revision INTEGER NOT NULL, document_json TEXT NOT NULL,
 content_hash TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(assignment_id,revision)
);
CREATE TABLE peer_training (
 round_id TEXT NOT NULL REFERENCES peer_rounds(id), person_id TEXT NOT NULL REFERENCES peer_round_people(id),
 rubric_hash TEXT NOT NULL, version TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(round_id,person_id)
);
CREATE TABLE peer_author_responses (
 assignment_id TEXT PRIMARY KEY REFERENCES peer_assignments(id), author_id TEXT NOT NULL,
 review_hash TEXT NOT NULL, revision INTEGER NOT NULL, document_json TEXT NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE peer_response_versions (
 assignment_id TEXT NOT NULL REFERENCES peer_assignments(id), revision INTEGER NOT NULL,
 review_hash TEXT NOT NULL, document_json TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(assignment_id,revision)
);
CREATE TABLE peer_action_operations (
 actor TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 result_json TEXT NOT NULL, committed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
 PRIMARY KEY(actor,request_id)
);
CREATE TABLE peer_moderation_events (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES peer_assignments(id), actor TEXT NOT NULL,
 action TEXT NOT NULL, review_revision INTEGER NOT NULL, review_hash TEXT NOT NULL, reason TEXT NOT NULL, created INTEGER NOT NULL
);
