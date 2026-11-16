-- Memberships ordering uses committed Deploy sequences, not delivery clocks.
CREATE TABLE IF NOT EXISTS contacts_membership_frontiers (
  school_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  publication_sequence INTEGER NOT NULL CHECK(publication_sequence >= 0),
  publication_id TEXT,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('direct','publication')),
  operation_id TEXT NOT NULL,
  field_revision INTEGER NOT NULL,
  PRIMARY KEY(school_id, staff_id)
);
