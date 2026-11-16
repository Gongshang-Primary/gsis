-- Derived Roster-owned current copy, not a second Deploy authority. Historical
-- allocation inputs remain in roster_runs; replacing this copy never rewrites them.
CREATE TABLE IF NOT EXISTS roster_workload_snapshots (
  school_id TEXT NOT NULL,
  service_date TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(length(payload_json) <= 1048576),
  observed_at INTEGER NOT NULL,
  PRIMARY KEY(school_id, service_date)
);
