CREATE TABLE IF NOT EXISTS layout_heads (
 school_id TEXT NOT NULL, year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2099),
 revision INTEGER NOT NULL CHECK(revision>0), snapshot_id TEXT NOT NULL,
 source_publication_id TEXT, source_sequence INTEGER, updated_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,year)
);
CREATE TABLE IF NOT EXISTS layout_snapshots (
 school_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, year INTEGER NOT NULL,
 revision INTEGER NOT NULL, object_key TEXT NOT NULL, sha256 TEXT NOT NULL,
 bytes INTEGER NOT NULL, source_json TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,snapshot_id), UNIQUE(school_id,year,revision)
);
CREATE TABLE IF NOT EXISTS layout_rows (
 school_id TEXT NOT NULL, year INTEGER NOT NULL, table_name TEXT NOT NULL,
 row_id TEXT NOT NULL, revision INTEGER NOT NULL, value_json TEXT NOT NULL,
 PRIMARY KEY(school_id,year,table_name,row_id)
);
CREATE TABLE IF NOT EXISTS layout_annotations (
 school_id TEXT NOT NULL, year INTEGER NOT NULL, table_name TEXT NOT NULL,
 row_id TEXT NOT NULL, revision INTEGER NOT NULL, value_json TEXT NOT NULL,
 PRIMARY KEY(school_id,year,table_name,row_id)
);
CREATE TABLE IF NOT EXISTS layout_previews (
 school_id TEXT NOT NULL, preview_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 year INTEGER NOT NULL, base_revision INTEGER NOT NULL, input_digest TEXT NOT NULL,
 payload_json TEXT NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,preview_id)
);
CREATE INDEX IF NOT EXISTS layout_preview_expiry ON layout_previews(school_id,expires_at);
