# GSiS v0.9.3a

Roster patch on v0.9.3. All accepted requests in this patch are implemented; there is no separate active product backlog.

- Render Report Absence from verified form metadata without waiting for Calendar, timetable models or the full report. Add the persistent thick blue outline action `Absent full day w/o relief instructions`; preserve full-day semantics and explicit no-instructions intent, including unresolved timetable timing.
- Render verified dated baseline or suspended timetable data locally before refreshing report records. Restore IndexedDB data before joining a pending online model read. Match date, source ID, revision, teacher identity and Calendar context; preserve unchanged grid DOM and draft focus.
- Warm missing or expired dated Calendar context automatically from the main screen, reusing the existing report preload and skipping already valid today/tomorrow context. Navigation and account changes fence delayed warm completions.
- Reuse signed Calendar windows for report/entry reads with original source age and account/window verification. Keep fresh checks for mutations. Cache freshness is checked against actual source identities; unchanged timetable packages are reused.
- Open Own arrangements without saving the absence or instruction draft. Show the filterable horizontal full-day grid immediately when local data is available. Keep selected colleagues locally and commit requests, instructions and absence atomically through Submit absence.
- Validate changed lessons, combination classes and current colleague availability at submission. Refresh only affected chooser rows/cells, retaining the filter and selections. Preserve previous instruction text and provide an explicit review action after timetable changes.
- Show pending Own arrangements peer approvals in Assign Relief with recipient names. Pending requests remain unresolved until accepted; rejected, expired and cancelled requests do not retain a pending marker.
- Return durable acceptance receipts without reconstructing the report. Preserve the green saved status when the independent record refresh fails, and retain exact retry identity when confirmation is uncertain.
- Preserve lazy archived STAPLER plans during candidate previews and atomic draft validation; do not decompress unrelated archived plans.
