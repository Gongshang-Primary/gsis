# Restore local Excel export

- Model: Codex
- Status: implementing
- Updated: 2026-11-18, Asia/Singapore (owner incident screenshot)
- Branch: codex/roster-absence-clash-confirm; PR #182
- Base: 136ba17589abfe944ee04029874f1c085e6fa9de
- Owner request: Export Excel, relief Excel and Class POV must use local copies; urgent hotfix. Earlier requirement: `roster-export-excel-local.md`. Owner waived Claude review for v0.9 hotfixes; owner merges and deploys.
- Scope: `roster-update/public/roster-operations-ui.js`, local export tests, canonical build outputs if changed, handoff notes. Existing Roster local cache may be used; no live data/settings, provider calls, Apps Script, allocator policy or v1 changes.

## Cause and repair

`localExportSnapshot` requires exportContext.revision to equal the visible revision. D1 builds the context before incrementing the response revision; compact patches and publication acknowledgements also update the visible revision without replacing the context. The browser therefore rejects usable local copies. An absent exportContext is rejected even when the local allocation model contains every timetable cell. Export also calls localTimetable without cache-only mode, allowing an online fetch on click.

Accept a complete context for the same timetable identity and rebuild its attendance/assignment projection from current local data. When context is missing or belongs to another timetable, build the canonical export plan from the complete locally loaded effective timetable. Never substitute an old timetable for missing current cells. Keep a dated, owner-scoped local snapshot for recovery; mark reused data as unverified for edits. Export uses local data only and clearly labels unsaved/unconfirmed state and source revision. Preserve absence-reason privacy and current renderer behavior.

## Acceptance

- All three export buttons produce actual XLSX files from complete local data when the backend is unreachable, including the D1 revision mismatch and absent-context cases.
- Local draft assignments and current absences/demands override older export-context projections. Removed data must not leak back from an old context.
- No API request or online timetable load occurs on export. An optional baseline is used only if already available locally; the existing local workbook layout remains the fallback.
- Missing/incomplete or mismatched timetable data is refused explicitly, not exported as empty/free cells.
- Owner/date-scoped cache survives a page-session reload without making cached data authoritative for writes.
- Canonical build clean, full local v0.9/LORD and all-five-job CI green at the final head, new owner package/PR record.

## Verification

Pending; earlier results apply only to the preceding Combine head.
