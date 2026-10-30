# roster-relief-on-timetable: relief in dated timetable views

- Status: implementing
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 October 2026
- Branch: codex/roster-relief-on-timetable
- Base SHA: 18154f5b499d204456bf446d384fd6894bf05d19 (rows 10 to 13 predecessor)
- User-authorised scope: queue row 14; show relief on teacher, class and TG timetables and exports.
- Files/domains: shared/roster-operations.js, backend/RosterOperations.gs, roster-update/public/roster.js and roster-export.js, styles, generated files, tests.

## Decisions
Ordinary teachers see only frozen published relief. SMC/Admin see saved assignments marked Not yet published where applicable. Read projections expose schedule fields only, never instructions, leave reasons, contacts or workload. Normal-day views use the verified Calendar parity already read by the timetable screen; do not guess odd/even. Screen, PDF and Excel share the dated projection. Existing confirmed/published suspension and original-baseline boundaries remain intact.

## Verification
Pending Linux build/full regression suite. No live records, notifications, merge or deployment. No local execution claim.

