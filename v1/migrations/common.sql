PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS product_operations (
 school_id TEXT NOT NULL, operation_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, digest TEXT NOT NULL, fence INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL CHECK(state IN ('prepared','committed','aborted')),
 created_at INTEGER NOT NULL, valid_until INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 request_digest TEXT, authority_action TEXT, decision_id TEXT, receipt_json TEXT, PRIMARY KEY(school_id, operation_id)
);
CREATE INDEX IF NOT EXISTS product_operations_pending ON product_operations(school_id,state,created_at);
CREATE TABLE IF NOT EXISTS product_assertions (id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE IF NOT EXISTS product_admissions (
 school_id TEXT NOT NULL, operation_id TEXT NOT NULL, fence INTEGER NOT NULL, digest TEXT NOT NULL,
 decision_id TEXT NOT NULL, valid_until INTEGER NOT NULL, pins_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('acquiring','ready','resolving','resolved','aborted')),
 PRIMARY KEY(school_id,operation_id)
);
CREATE TABLE IF NOT EXISTS product_audit (
 school_id TEXT NOT NULL, event_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, action TEXT NOT NULL, recorded_at INTEGER NOT NULL,
 decision_id TEXT, details_json TEXT NOT NULL, PRIMARY KEY(school_id,event_id)
);
CREATE INDEX IF NOT EXISTS product_audit_operation ON product_audit(school_id,operation_id);
CREATE TABLE IF NOT EXISTS product_outbox (
 school_id TEXT NOT NULL, job_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 type TEXT NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued'
 CHECK(state IN ('queued','leased','accepted','delivered','failed','uncertain','cancelled')),
 due_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, fence INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER, provider_id TEXT, last_code TEXT, updated_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,job_id)
);
CREATE INDEX IF NOT EXISTS product_outbox_due ON product_outbox(school_id,state,due_at);
CREATE TABLE IF NOT EXISTS product_provider_events (
 school_id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider='whatsapp'), event_id TEXT NOT NULL,
 provider_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('sent','failed','delivered','read')),
 event_at INTEGER NOT NULL, digest TEXT NOT NULL, received_at INTEGER NOT NULL, matched_at INTEGER,
 PRIMARY KEY(school_id,provider,event_id)
);
CREATE INDEX IF NOT EXISTS product_provider_message ON product_provider_events(school_id,provider,provider_id,matched_at);
CREATE TABLE IF NOT EXISTS product_schema (owner TEXT NOT NULL, version INTEGER NOT NULL, installed_at INTEGER NOT NULL, PRIMARY KEY(owner,version));

CREATE TABLE IF NOT EXISTS source_pins(school_id TEXT NOT NULL,scope TEXT NOT NULL,pin_id TEXT NOT NULL,destination TEXT NOT NULL,operation_id TEXT NOT NULL,digest TEXT NOT NULL,fence INTEGER NOT NULL,revision TEXT NOT NULL,valid_until INTEGER NOT NULL,decision_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('held','released')),created_at INTEGER NOT NULL,PRIMARY KEY(school_id,pin_id));
CREATE INDEX IF NOT EXISTS source_pins_scope ON source_pins(school_id,scope,state);
CREATE TABLE IF NOT EXISTS source_changes(school_id TEXT NOT NULL,scope TEXT NOT NULL,operation_id TEXT NOT NULL,created_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(school_id,scope,operation_id));
CREATE TABLE IF NOT EXISTS source_assertions(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1));
