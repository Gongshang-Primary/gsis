-- GSiS operational records. Apply to the same D1 binding used by app and jobs.
CREATE TABLE IF NOT EXISTS gsis_edge_heads (
 scope TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
 mode TEXT NOT NULL DEFAULT 'legacy' CHECK(mode IN ('legacy','imported','active','paused')),
 write_token TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL,
 source_digest TEXT NOT NULL DEFAULT '',
 imported_records INTEGER NOT NULL DEFAULT 0,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1)
);
CREATE TABLE IF NOT EXISTS gsis_edge_records (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE,
 collection TEXT NOT NULL,
 record_id TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0,
 record_date TEXT NOT NULL DEFAULT '',
 value_json TEXT NOT NULL,
 revision INTEGER NOT NULL,
 PRIMARY KEY(scope,collection,record_id)
);
CREATE INDEX IF NOT EXISTS gsis_edge_records_date ON gsis_edge_records(scope,collection,record_date,record_id);
CREATE TABLE IF NOT EXISTS gsis_edge_receipts (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE,
 actor TEXT NOT NULL,
 request_id TEXT NOT NULL,
 digest TEXT NOT NULL,
 revision INTEGER NOT NULL,
 result_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(scope,actor,request_id)
);
CREATE INDEX IF NOT EXISTS gsis_edge_receipts_age ON gsis_edge_receipts(scope,created_at);
CREATE TABLE IF NOT EXISTS gsis_edge_transitions (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE,
 revision INTEGER NOT NULL,
 previous_mode TEXT NOT NULL,
 next_mode TEXT NOT NULL,
 actor TEXT NOT NULL,
 proof_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(scope,revision)
);
-- Evidence survives restarting an imported scope; active/paused scopes are never reset.
CREATE TABLE IF NOT EXISTS gsis_edge_import_resets (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE,
 actor TEXT NOT NULL,
 request_id TEXT NOT NULL,
 previous_revision INTEGER NOT NULL,
 source_digest TEXT NOT NULL,
 archive_digest TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 imported_records INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(scope,actor,request_id)
);
