-- Core alone retains the helper account's encrypted offline credential.
CREATE TABLE core_google_connections (
  school_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('connected','disconnected','reconnect-required')),
  subject TEXT,
  email TEXT,
  config_digest TEXT NOT NULL,
  credential_cipher TEXT,
  connected_by TEXT,
  connected_at INTEGER,
  updated_at INTEGER NOT NULL
);
-- One bounded, expiring consent flow per school. Operation/audit history is in
-- the existing product journals, not an accumulating copy of OAuth secrets.
CREATE TABLE core_google_flows (
  school_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  config_digest TEXT NOT NULL,
  connection_revision INTEGER NOT NULL,
  flow_cipher TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','exchanging','completed','failed','cancelled')),
  expires_at INTEGER NOT NULL
);
