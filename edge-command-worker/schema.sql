-- One deployment/database per app; app is also required in every identity lookup.
CREATE TABLE IF NOT EXISTS edge_scopes (
 app TEXT NOT NULL,document_key TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'direct' CHECK(mode IN ('direct','queued')),
 admission_paused INTEGER NOT NULL DEFAULT 0,dispatch_paused INTEGER NOT NULL DEFAULT 0,config_generation INTEGER NOT NULL DEFAULT 0,
 head_sequence INTEGER,active_request_id TEXT,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,fence INTEGER NOT NULL DEFAULT 0,
 refresh_token TEXT,refresh_until INTEGER NOT NULL DEFAULT 0,refresh_generation INTEGER NOT NULL DEFAULT 0,
 high_water INTEGER NOT NULL DEFAULT 0,last_used INTEGER NOT NULL DEFAULT 0,last_applied INTEGER,last_revision_json TEXT,
 shadow_at INTEGER,shadow_result TEXT,failures INTEGER NOT NULL DEFAULT 0,alert_incident TEXT,alert_pending INTEGER NOT NULL DEFAULT 0,last_reconciled INTEGER,
 PRIMARY KEY(app,document_key)
);
CREATE TABLE IF NOT EXISTS edge_jobs (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,app TEXT NOT NULL,document_key TEXT NOT NULL,request_id TEXT NOT NULL,issued_at INTEGER NOT NULL,
 actor_key TEXT NOT NULL,actor_json TEXT NOT NULL,action TEXT NOT NULL,schema_version INTEGER NOT NULL,expected_revision_json TEXT NOT NULL,
 payload_json TEXT NOT NULL,payload_hash TEXT NOT NULL,binding_json TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('QUEUED','RUNNING','CHECKING','UNCERTAIN','APPLIED','REJECTED')),
 result_kind TEXT NOT NULL DEFAULT 'pending',receipt_json TEXT,error_code TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 next_at INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,fence INTEGER NOT NULL DEFAULT 0,
 checks INTEGER NOT NULL DEFAULT 0,dispatch_failures INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,exported_version INTEGER NOT NULL DEFAULT 0,
 UNIQUE(app,request_id),UNIQUE(app,sequence),FOREIGN KEY(app,document_key) REFERENCES edge_scopes(app,document_key)
);
CREATE INDEX IF NOT EXISTS edge_job_fifo ON edge_jobs(app,document_key,sequence);
CREATE INDEX IF NOT EXISTS edge_job_due ON edge_jobs(app,state,next_at,lease_until);
CREATE INDEX IF NOT EXISTS edge_job_actor ON edge_jobs(app,actor_key,sequence);
CREATE INDEX IF NOT EXISTS edge_job_depth ON edge_jobs(app,state,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS edge_one_inflight ON edge_jobs(app,document_key) WHERE state IN ('RUNNING','CHECKING');
CREATE TABLE IF NOT EXISTS edge_receipt_index (
 app TEXT NOT NULL,request_id TEXT NOT NULL,document_key TEXT NOT NULL,actor_key TEXT NOT NULL,action TEXT NOT NULL,schema_version INTEGER NOT NULL,
 binding_json TEXT NOT NULL,payload_hash TEXT NOT NULL,receipt_json TEXT NOT NULL,decision_digest TEXT NOT NULL,google_reference TEXT NOT NULL,
 export_version INTEGER NOT NULL,export_digest TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(app,request_id)
);
CREATE TABLE IF NOT EXISTS edge_job_steps (
 app TEXT NOT NULL,parent_request_id TEXT NOT NULL,step_key TEXT NOT NULL,child_request_id TEXT,target_app TEXT NOT NULL,publication_json TEXT NOT NULL,
 state TEXT NOT NULL,reason_code TEXT,attempts INTEGER NOT NULL DEFAULT 0,checks INTEGER NOT NULL DEFAULT 0,receipt_json TEXT,revision_json TEXT,
 created_at INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(app,parent_request_id,step_key)
);
CREATE TABLE IF NOT EXISTS edge_job_events (
 app TEXT NOT NULL,request_id TEXT NOT NULL,event_sequence INTEGER NOT NULL,state TEXT NOT NULL,at INTEGER NOT NULL,fence INTEGER NOT NULL,
 error_code TEXT,evidence_digest TEXT,PRIMARY KEY(app,request_id,event_sequence)
);
CREATE TABLE IF NOT EXISTS edge_nonces (
 app TEXT NOT NULL,purpose TEXT NOT NULL,nonce TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(app,purpose,nonce)
);
CREATE INDEX IF NOT EXISTS edge_nonce_expiry ON edge_nonces(app,expires_at);
CREATE TABLE IF NOT EXISTS edge_cache (
 app TEXT NOT NULL,document_key TEXT NOT NULL,projection TEXT NOT NULL,audience_key TEXT NOT NULL,auth_revision TEXT NOT NULL,schema_version INTEGER NOT NULL,
 google_revision_json TEXT NOT NULL,source_digest TEXT NOT NULL,payload_digest TEXT NOT NULL,manifest_json TEXT NOT NULL,payload_json TEXT NOT NULL,
 fetched_at INTEGER NOT NULL,verified_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,high_water INTEGER NOT NULL,stale INTEGER NOT NULL DEFAULT 0,
 generation INTEGER NOT NULL,PRIMARY KEY(app,document_key,projection,audience_key,auth_revision,schema_version)
);
CREATE INDEX IF NOT EXISTS edge_cache_expiry ON edge_cache(app,expires_at);

-- Private Admin recovery audit. Never included in public/user health or diagnostics.
CREATE TABLE IF NOT EXISTS edge_admin_audit (
 app TEXT NOT NULL,request_id TEXT NOT NULL,actor_key TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL,
 PRIMARY KEY(app,request_id)
);

CREATE TABLE IF NOT EXISTS edge_reconciliation (
 app TEXT NOT NULL,document_key TEXT NOT NULL,request_id TEXT NOT NULL,config_generation INTEGER NOT NULL,
 row_version INTEGER NOT NULL,status TEXT NOT NULL,checked_at INTEGER NOT NULL,evidence_json TEXT NOT NULL,
 PRIMARY KEY(app,document_key,request_id)
);
