CREATE TABLE personal_model_profiles (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, label TEXT NOT NULL, provider TEXT NOT NULL,
 api_url TEXT NOT NULL, model TEXT NOT NULL, supports_images INTEGER NOT NULL, purposes_json TEXT NOT NULL,
 max_tokens INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, token_parameter TEXT NOT NULL, send_temperature INTEGER NOT NULL,
 credential_cipher TEXT, credential_key_id TEXT, credential_revision INTEGER NOT NULL,
 execution_revision TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','deleted')),
 created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX personal_models_owner ON personal_model_profiles(owner,status,updated);
CREATE TABLE personal_model_operations (
 owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL, hash_key_id TEXT,
 profile_id TEXT NOT NULL, result_json TEXT NOT NULL, created INTEGER NOT NULL,
 PRIMARY KEY(owner,request_id)
);
CREATE INDEX personal_model_operations_time ON personal_model_operations(owner,created);
CREATE TABLE personal_model_revisions (
 profile_id TEXT NOT NULL REFERENCES personal_model_profiles(id), revision INTEGER NOT NULL,
 config_json TEXT NOT NULL, action TEXT NOT NULL, created INTEGER NOT NULL,
 PRIMARY KEY(profile_id,revision)
);
