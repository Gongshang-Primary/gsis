-- Owner-local asynchronous Google Drive export receipts; no cross-owner writes.
CREATE TABLE IF NOT EXISTS drive_backup_control (
 school_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 last_run_at INTEGER, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS drive_backup_status (
 school_id TEXT NOT NULL, dataset TEXT NOT NULL, name TEXT NOT NULL,
 source_digest TEXT, verified_digest TEXT, status TEXT NOT NULL DEFAULT 'never-backed-up',
 checked_at INTEGER, source_observed_at INTEGER, last_error TEXT,
 importable INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(school_id,dataset)
);
CREATE TABLE IF NOT EXISTS drive_backup_files (
 school_id TEXT NOT NULL, dataset TEXT NOT NULL, day TEXT NOT NULL,
 file_id TEXT NOT NULL, folder_id TEXT NOT NULL, source_digest TEXT NOT NULL,
 artifact_key TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
 prior_sha256 TEXT, prior_bytes INTEGER,
 state TEXT NOT NULL CHECK(state IN('pending','verified','abandoned')),
 verified_at INTEGER, updated_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,dataset,day), UNIQUE(file_id)
);
CREATE INDEX IF NOT EXISTS drive_backup_files_pending ON drive_backup_files(school_id,state,day);
CREATE TABLE IF NOT EXISTS drive_backup_assertions(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1));
