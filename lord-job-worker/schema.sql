-- D1 owns all new LORD queue, receipt, status and bounded audit records.
CREATE TABLE IF NOT EXISTS lord_jobs (
 job_id TEXT PRIMARY KEY, actor_key TEXT NOT NULL, actor_json TEXT NOT NULL,
 action TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('QUEUED','RUNNING','CHECKING','UNCERTAIN','APPLIED','REJECTED')),
 receipt_json TEXT, error_json TEXT, history_json TEXT NOT NULL DEFAULT '[]',
 checks INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT,
 version INTEGER NOT NULL DEFAULT 1, backup_version INTEGER NOT NULL DEFAULT 0,
 backup_until INTEGER NOT NULL DEFAULT 0, backup_token TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lord_job_pending_actor_action ON lord_jobs(actor_key,action)
 WHERE state IN ('QUEUED','RUNNING','CHECKING','UNCERTAIN');
CREATE INDEX IF NOT EXISTS lord_job_due ON lord_jobs(state,next_at,lease_until);
CREATE INDEX IF NOT EXISTS lord_job_actor ON lord_jobs(actor_key,created_at);
CREATE TABLE IF NOT EXISTS lord_job_nonces (nonce TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
