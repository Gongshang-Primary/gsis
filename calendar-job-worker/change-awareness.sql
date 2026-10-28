-- Optional additive migration in the EXISTING dedicated CALENDAR_JOBS_DB.
-- Apply only when preparing the explicitly approved Calendar push addition.
CREATE TABLE IF NOT EXISTS calendar_change_intents (
 intent_id TEXT PRIMARY KEY, actor_key TEXT NOT NULL, action TEXT NOT NULL,
 year INTEGER NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL, next_at INTEGER NOT NULL, checks INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS calendar_change_intents_due ON calendar_change_intents(state,next_at);
CREATE TABLE IF NOT EXISTS calendar_change_journal (
 cursor INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT UNIQUE NOT NULL,
 kind TEXT NOT NULL, actor_key TEXT NOT NULL DEFAULT '', year INTEGER NOT NULL,
 created_at INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS calendar_change_dedupe (source_id TEXT PRIMARY KEY,cursor INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS calendar_change_head (id INTEGER PRIMARY KEY CHECK(id=1),cursor INTEGER NOT NULL,floor INTEGER NOT NULL);
INSERT OR IGNORE INTO calendar_change_head(id,cursor,floor) VALUES(1,0,0);
CREATE TABLE IF NOT EXISTS calendar_change_job_checkpoints (job_id TEXT PRIMARY KEY,stamp TEXT NOT NULL,updated_at INTEGER NOT NULL);
