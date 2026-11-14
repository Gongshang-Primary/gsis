-- LORD owns resources, reservations, loans and per-item state. No other owner's tables.
CREATE TABLE IF NOT EXISTS lord_resources (
 school_id TEXT NOT NULL, resource_id TEXT NOT NULL, name TEXT NOT NULL,
 type TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 200),
 active INTEGER NOT NULL CHECK(active IN (0,1)), exclusive INTEGER NOT NULL CHECK(exclusive IN (0,1)),
 buffer_periods INTEGER NOT NULL CHECK(buffer_periods BETWEEN 0 AND 4),
 revision INTEGER NOT NULL CHECK(revision>0), metadata_json TEXT NOT NULL,
 PRIMARY KEY(school_id,resource_id)
);
CREATE TABLE IF NOT EXISTS lord_bookings (
 school_id TEXT NOT NULL, booking_id TEXT NOT NULL, staff_id TEXT NOT NULL,
 created_by TEXT NOT NULL, service_date TEXT NOT NULL, start_period INTEGER NOT NULL,
 end_period INTEGER NOT NULL CHECK(end_period>start_period),
 status TEXT NOT NULL CHECK(status IN ('BOOKED','COLLECTED','RETURNED','CANCELLED','CLOSED','DECLARED_RETURNED')),
 revision INTEGER NOT NULL, details_json TEXT NOT NULL, created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL, period_id TEXT NOT NULL DEFAULT 'initial',
 PRIMARY KEY(school_id,booking_id)
);
CREATE INDEX IF NOT EXISTS lord_booking_date ON lord_bookings(school_id,service_date,status,start_period,end_period);
CREATE INDEX IF NOT EXISTS lord_booking_person ON lord_bookings(school_id,staff_id,status,service_date);
CREATE TABLE IF NOT EXISTS lord_booking_items (
 school_id TEXT NOT NULL, booking_id TEXT NOT NULL, resource_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 200),
 collected_quantity INTEGER NOT NULL DEFAULT 0 CHECK(collected_quantity>=0 AND collected_quantity<=quantity),
 returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK(returned_quantity>=0 AND returned_quantity<=collected_quantity),
 issue_quantity INTEGER NOT NULL DEFAULT 0 CHECK(issue_quantity>=0 AND issue_quantity<=returned_quantity),
 PRIMARY KEY(school_id,booking_id,resource_id),
 FOREIGN KEY(school_id,booking_id) REFERENCES lord_bookings(school_id,booking_id),
 FOREIGN KEY(school_id,resource_id) REFERENCES lord_resources(school_id,resource_id)
);
CREATE INDEX IF NOT EXISTS lord_item_resource ON lord_booking_items(school_id,resource_id,booking_id);
CREATE TABLE IF NOT EXISTS lord_item_events (
 school_id TEXT NOT NULL, event_id TEXT NOT NULL, booking_id TEXT NOT NULL, resource_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('collect','return','issue','correction')), quantity INTEGER NOT NULL,
 operation_id TEXT NOT NULL, actor_id TEXT NOT NULL, recorded_at INTEGER NOT NULL, details_json TEXT NOT NULL,
 PRIMARY KEY(school_id,event_id)
);
CREATE TABLE IF NOT EXISTS lord_photos (
 school_id TEXT NOT NULL, photo_id TEXT NOT NULL, booking_id TEXT NOT NULL,
 object_key TEXT NOT NULL, sha256 TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
 actor_id TEXT NOT NULL, recorded_at INTEGER NOT NULL, booking_revision INTEGER NOT NULL, phase TEXT NOT NULL CHECK(phase IN ('collection','return','incident')), PRIMARY KEY(school_id,photo_id)
);
CREATE TABLE IF NOT EXISTS lord_incidents (
 school_id TEXT NOT NULL, incident_id TEXT NOT NULL, booking_id TEXT NOT NULL,
 staff_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','responded','resolved')),
 revision INTEGER NOT NULL, details_json TEXT NOT NULL, response_json TEXT, created_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,incident_id)
);
CREATE INDEX IF NOT EXISTS lord_incident_staff ON lord_incidents(school_id,staff_id,status);
CREATE TABLE IF NOT EXISTS lord_preferences (
 school_id TEXT NOT NULL, staff_id TEXT NOT NULL, revision INTEGER NOT NULL,
 email INTEGER NOT NULL CHECK(email IN (0,1)), whatsapp INTEGER NOT NULL CHECK(whatsapp IN (0,1)),
 telegram INTEGER NOT NULL CHECK(telegram IN (0,1)), PRIMARY KEY(school_id,staff_id)
);
CREATE TABLE IF NOT EXISTS lord_references (
 school_id TEXT NOT NULL, staff_id TEXT NOT NULL, name TEXT NOT NULL,
 email TEXT, mobile TEXT, source_revision TEXT NOT NULL, observed_at INTEGER NOT NULL,
 PRIMARY KEY(school_id,staff_id)
);
CREATE TABLE IF NOT EXISTS lord_reference_state (
 school_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, observed_at INTEGER NOT NULL,
 contacts_revision TEXT NOT NULL, deploy_revision TEXT, next_refresh_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lord_periods (
 school_id TEXT NOT NULL, period_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','closed')),
 revision INTEGER NOT NULL, starts_at INTEGER NOT NULL, closed_at INTEGER, manifest_json TEXT,
 PRIMARY KEY(school_id,period_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS lord_one_active_period ON lord_periods(school_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS lord_links (
 school_id TEXT NOT NULL, token_hash TEXT NOT NULL, booking_id TEXT, incident_id TEXT,
 purpose TEXT NOT NULL CHECK(purpose IN ('booking-response','incident-response','signage')),
 staff_id TEXT, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
 scope_json TEXT NOT NULL, PRIMARY KEY(school_id,token_hash)
);
CREATE TABLE IF NOT EXISTS lord_settings (
 school_id TEXT NOT NULL, setting_key TEXT NOT NULL, revision INTEGER NOT NULL,
 value_json TEXT NOT NULL, PRIMARY KEY(school_id,setting_key)
);
CREATE TABLE IF NOT EXISTS lord_job_marks (
 school_id TEXT NOT NULL, job_key TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
 created_at INTEGER NOT NULL, PRIMARY KEY(school_id,job_key)
);

CREATE TABLE IF NOT EXISTS lord_accessories (
 school_id TEXT NOT NULL, booking_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('styluses','headphones')),
 collected_quantity INTEGER NOT NULL CHECK(collected_quantity BETWEEN 0 AND 200),
 returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK(returned_quantity BETWEEN 0 AND collected_quantity),
 PRIMARY KEY(school_id,booking_id,kind), FOREIGN KEY(school_id,booking_id) REFERENCES lord_bookings(school_id,booking_id)
);
