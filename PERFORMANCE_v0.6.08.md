# Performance and reliability v0.6.08

Ponytail review keeps the existing draft operations, teacher records, authorization, journal and revision checks. No dependency, storage table, trigger or background migration is added.

Timetable-name validation runs against the current in-memory version before a local edit or save. The backend repeats the check at the write boundary. These checks need no separate request. Stable IDs are existing record identifiers; viewing one creates no new identity.

Inactivation and deletion remove deployment references in the same version save. They do not send one write for each assignment. Deletion compares the reviewed profile and allocation impact with the current record before committing. The existing journal and final index marker govern visibility and retry behavior. This does not make a multi-request Sheets operation one atomic Google request.

Teacher profile saves include the reporting and relief roots required by cleanup. The measured HR field read is 13,653 cells with no IP assignments and 55,665 with 1,500 assignments. The previous 54,000-cell ceiling becomes 56,000 for this operation. Both fixtures still use two atomic write batches. Simple note, exclusion and class-ability saves retain their existing bounds. These are fixture operation counts, not live latency measurements.

Roster treats missing authority as a failed access check. It does not infer a role, add a retry loop, or cache a fallback grant. Timetable and Calendar reads keep their existing behavior.

Packaging reuses Python's zipfile and hashlib. The complete manual and README are added to the existing archive and checksum list. Only the archive's README link is adjusted to point to its neighboring manual. The source README still links into docs. No screenshot is recompressed or fetched at runtime.

Focused checks cover teacher validation and cleanup, role boundaries, Roster authority responses, manual navigation, offline assets and package checksum coverage. Full results are in VALIDATION.md. Fixture checks do not measure production latency or prove Google deployment permissions.
