# Task Claim: v1 Calendar Bulk Event Import (T03)

- Task ID: `v1-calendar-bulk-import`
- Model: `Antigravity`
- Branch: `antigravity/v1-calendar-bulk-import`
- Reviewer: `Muse` (exact-head review)
- Coordinator / Merger: `GPT`
- Scope: Implement bounded two-step bulk event import (`importEventsPreview` read-only validation + `importEventsApply` atomic CAS commit) in Calendar (`v1/services/calendar/bulk-import.mjs` + `v1/services/calendar/service.mjs`):
  - Preview validates school/year bounds, active non-archived year, row ceiling (<= 500 rows), required title/date/time ordering via Calendar's `validateEvent`, optional multi-room `VenueID` validation against Venues `/internal/catalogue`, computes deterministic `previewDigest` and year revision snapshot, and performs zero writes.
  - Apply verifies `previewDigest`, checks current year revision (`409 REVISION_CONFLICT` if changed), uses `operationId` idempotent replay, atomically inserts validated events in one D1 transaction (`commitOperation`), queues existing Calendar sync outbox intents (no live sends while disabled), and rejects unauthorized, foreign-school, archived-year, oversize, or invalid inputs cleanly.

## Files Claimed
- `docs/coordination/tasks/v1-calendar-bulk-import.md`
- `v1/services/calendar/bulk-import.mjs`
- `v1/services/calendar/service.mjs`
- `tests/v1-product-calendar-bulk-import.mjs`

## Constraints
- Zero v0.9 changes (`npm run build` zero drift).
- No live Google Calendar sends or live school mutations.
