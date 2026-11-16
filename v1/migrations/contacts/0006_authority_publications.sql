-- Direct authority acceptance and immutable Deploy publication share an ordering
-- frontier. Historical accepted records remain unchanged by this additive table.
CREATE TABLE IF NOT EXISTS contacts_authority_publication_frontiers(
  school_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  field TEXT NOT NULL CHECK(field IN('smc','eo','schoolLeader')),
  publication_sequence INTEGER NOT NULL,
  publication_id TEXT,
  source_kind TEXT NOT NULL CHECK(source_kind IN('direct','publication')),
  operation_id TEXT NOT NULL,
  field_revision INTEGER NOT NULL,
  PRIMARY KEY(school_id,staff_id,field)
);
