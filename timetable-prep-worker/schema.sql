/* Additive timetable preparation only. Keep existing rehearsal schema and data. */
CREATE TABLE IF NOT EXISTS gsis_ttprep_heads (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 instance_id TEXT NOT NULL,
 schema_version INTEGER NOT NULL CHECK(schema_version=1),
 mode TEXT NOT NULL CHECK(mode='shadow-only'),
 revision INTEGER NOT NULL CHECK(revision>=0),
 source_key TEXT,
 document TEXT NOT NULL DEFAULT 'null',
 last_request_id TEXT,
 updated_at TEXT
);
CREATE TABLE IF NOT EXISTS gsis_ttprep_receipts (
 instance_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 digest TEXT NOT NULL,
 revision INTEGER NOT NULL,
 actor_email TEXT NOT NULL,
 response_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(instance_id,request_id)
);
CREATE TABLE IF NOT EXISTS gsis_ttprep_versions (
 instance_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 document TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(instance_id,revision)
);
INSERT OR IGNORE INTO gsis_ttprep_heads(singleton,instance_id,schema_version,mode,revision)
 SELECT 1,instance_id,1,'shadow-only',0 FROM rehearsal_meta
 WHERE singleton=1 AND schema_name='gsis.rehearsal.ledger' AND schema_version=1 AND mode='simulation-only';
