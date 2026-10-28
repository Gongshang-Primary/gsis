-- Dedicated optional Calendar command receipts. Never bind the rehearsal D1 here.
CREATE TABLE IF NOT EXISTS calendar_jobs (
 job_id TEXT PRIMARY KEY,
 actor_key TEXT NOT NULL,
 actor_json TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('saveEvent','deleteEvent','saveParentSide','relocateEvent')),
 payload_json TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 event_key TEXT NOT NULL,
 year INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('QUEUED','RUNNING','CHECKING','SAVED','NEEDS_ATTENTION')),
 outcome TEXT,
 blocked INTEGER NOT NULL DEFAULT 1 CHECK(blocked IN (0,1)),
 attempt_operation_id TEXT NOT NULL,
 dispatches INTEGER NOT NULL DEFAULT 0,
 checks INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 result_json TEXT,
 error_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_jobs_event_pending ON calendar_jobs(event_key) WHERE blocked=1;
CREATE INDEX IF NOT EXISTS calendar_jobs_due ON calendar_jobs(state,next_at,lease_until);
CREATE INDEX IF NOT EXISTS calendar_jobs_actor ON calendar_jobs(actor_key,created_at);
CREATE TABLE IF NOT EXISTS calendar_job_nonces (nonce TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS calendar_job_maintenance (id TEXT PRIMARY KEY,lease_until INTEGER NOT NULL);
