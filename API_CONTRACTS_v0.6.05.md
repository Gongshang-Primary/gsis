# API contracts v0.6.05

Existing write protocol 500 and relief schema 3/whole-week-v3 remain unchanged. Workload is derived and does not persist B, D or specialist percentages. TG add/update accepts demandMode: additional or replacement. Old callers preserve an existing value; missing legacy values are flagged for review.

Contacts deploySnapshot with authorityOnly and rosterAuthority returns user.rosterSMC from one active current contact's role membership. Acting roles are included. Admin access alone does not grant SMC. Pending directory changes fail closed. The signed school identity remains authoritative.

Roster Pages routes map to Deploy actions rosterProfile, rosterRead, rosterUpload and rosterUpdate. POST origin, school session, signed bridge envelope and existing Contacts trust checks are required. Profile lists archives only for SMC. Read accepts ISO date; archive ID reads are SMC-only. Upload/update require SMC, current register revision and a unique requestId. Upload includes name, from, to, validated parsed model and a base64 XLSX. Update operation is metadata, activate, prune or restore. Exact same-actor retries return the existing receipt; stale revisions and changed request reuse are rejected.

Inputs: at most 400 teachers, 40 periods/day, five weekdays; unique teacher names, identical odd/even ordering, four string fields/cell, validated timing and real dates. Original source and generated XLSX each at most 8 MB. Gateway upload body at most 11 million characters; Apps Script envelope at most 12 million, existing non-Roster operations still 600,000. Signed workbook checks include size and ZIP signature; actual OOXML is produced by the shipped converter, not parsed again by Apps Script.

Calendar retains its original action/payload/result protocol and environment names. It is not a GSiS roster-date API yet.
