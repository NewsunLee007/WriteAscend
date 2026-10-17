ALTER TABLE student_revision_workspaces ADD COLUMN basis_kind TEXT NOT NULL DEFAULT 'teacher' CHECK(basis_kind IN('teacher','peer'));
ALTER TABLE student_revision_workspaces ADD COLUMN peer_round_id TEXT;
ALTER TABLE student_revision_workspaces ADD COLUMN peer_basis_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE student_revision_workspaces ADD COLUMN peer_basis_json TEXT NOT NULL DEFAULT '';
ALTER TABLE student_revision_versions ADD COLUMN basis_kind TEXT NOT NULL DEFAULT 'teacher';
ALTER TABLE student_revision_versions ADD COLUMN peer_basis_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE student_revision_versions ADD COLUMN peer_basis_json TEXT NOT NULL DEFAULT '';
