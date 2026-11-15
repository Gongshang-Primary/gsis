-- REIGN keeps durable Google file identities and cleanup progress across restarts.
-- Operational and security receipts remain retained in common owner tables.
CREATE TABLE IF NOT EXISTS lord_reign_archives (
 school_id TEXT NOT NULL, archive_id TEXT NOT NULL, period_id TEXT NOT NULL,
 source_digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('prepared','verified','cleanup-pending','complete')),
 revision INTEGER NOT NULL, manifest_json TEXT NOT NULL, cleanup_json TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,archive_id)
);
CREATE INDEX IF NOT EXISTS lord_reign_archive_period ON lord_reign_archives(school_id,period_id,created_at);
