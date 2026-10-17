-- Metadata only; connection credentials remain in the existing encrypted vault.
CREATE TABLE local_model_relays (
 profile_id TEXT PRIMARY KEY REFERENCES personal_model_profiles(id),
 owner TEXT NOT NULL,
 last_seen INTEGER NOT NULL,
 models_json TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'ready'
);
