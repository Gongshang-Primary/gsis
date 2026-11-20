-- Central Core-managed Google Drive backup orchestrator (Package 2).
-- Additive and self-contained; does not alter operational tables or prior migrations.
CREATE TABLE IF NOT EXISTS core_backup_cursor (
  school_id TEXT PRIMARY KEY,
  owner_cursor INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_cycle_check INTEGER,
  last_run_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS core_backup_datasets (
  school_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  dataset TEXT NOT NULL,
  name TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  drive_id TEXT NOT NULL,
  root_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL DEFAULT 'xlsx',
  importable INTEGER NOT NULL DEFAULT 0,
  writer_epoch INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'never-backed-up'
    CHECK(status IN ('never-backed-up','current','pending','stale','unknown','missing','failed','blocked','conflict')),
  source_digest TEXT,
  verified_digest TEXT,
  source_observed_at INTEGER,
  remote_verified_at INTEGER,
  last_checked_at INTEGER,
  last_changed_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, owner, dataset)
);

CREATE TABLE IF NOT EXISTS core_backup_jobs (
  school_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  dataset TEXT NOT NULL,
  day TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL
    CHECK(state IN ('queued','exporting','prepared','writing','verifying','verified','retryable','unknown','conflict','missing','blocked')),
  file_id TEXT,
  folder_id TEXT NOT NULL,
  drive_id TEXT NOT NULL,
  root_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  artifact_key TEXT,
  source_digest TEXT NOT NULL,
  target_sha256 TEXT,
  target_bytes INTEGER,
  prior_sha256 TEXT,
  prior_bytes INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  remote_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (school_id, owner, dataset, day),
  UNIQUE (school_id, operation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS core_backup_jobs_file_id
  ON core_backup_jobs(school_id, file_id) WHERE file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS core_backup_jobs_state
  ON core_backup_jobs(school_id, state, next_retry_at);

CREATE TABLE IF NOT EXISTS core_backup_assertions (
  id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK(ok = 1)
);
