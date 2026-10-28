-- Isolated rehearsal schema only. Deliberately no production table names or migrations.
CREATE TABLE rehearsal_meta (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 schema_name TEXT NOT NULL CHECK(schema_name='gsis.rehearsal.ledger'),
 schema_version INTEGER NOT NULL CHECK(schema_version=1),
 instance_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode='simulation-only')
);
CREATE TABLE rehearsal_ledger (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 instance_id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 document TEXT NOT NULL DEFAULT 'null' CHECK(length(document)<=524288),
 timetable_key TEXT,
 timetable_sha256 TEXT,
 last_request_id TEXT,
 updated_at TEXT
);
CREATE TABLE rehearsal_receipts (
 request_id TEXT PRIMARY KEY,
 instance_id TEXT NOT NULL,
 digest TEXT NOT NULL,
 revision INTEGER NOT NULL UNIQUE,
 actor_email TEXT NOT NULL,
 response_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE rehearsal_outbox (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL,
 request_id TEXT NOT NULL REFERENCES rehearsal_receipts(request_id),
 kind TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status='simulated'),
 detail_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE rehearsal_timetable_versions (
 revision INTEGER PRIMARY KEY,
 object_key TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL
);
