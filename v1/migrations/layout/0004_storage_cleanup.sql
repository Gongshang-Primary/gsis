-- Explicit manual cleanup journal; retained for restart and audit. No automatic deletion.
CREATE TABLE IF NOT EXISTS storage_cleanup (
 school_id TEXT NOT NULL, cleanup_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','complete')),
 revision INTEGER NOT NULL, plan_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, completed_at INTEGER,
 PRIMARY KEY(school_id,cleanup_id)
);
