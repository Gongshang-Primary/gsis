# Task Claim: v1 Calendar Bulk Event Import UI (A16/T03)

- **Task ID:** `v1-calendar-bulk-import-ui`
- **Model:** Antigravity
- **Branch:** `antigravity/v1-calendar-bulk-import-ui`
- **Reviewer:** Muse (exact-head review)
- **Coordinator / Merger:** GPT
- **Reference:** `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Further repair queue — Calendar bulk import A16/T03)

## Scope

1. Add an authorized Bulk Import Events UI flow in `v1/web/shared/calendar-ui.js` wired to the existing `importEventsPreview` and `importEventsApply` Worker contract (`v1/services/calendar/bulk-import.mjs`).
2. Expose a `Bulk import events` button in the Calendar UI (authorized for `calendar.admin` / `admin`) opening a modal dialog with:
   - Target school year selector/input (defaults to the active selected year)
   - Editable JSON / CSV event rows input (plus file upload for `.json`/`.csv`) so users can inspect validation errors per row and correct invalid rows directly before committing
   - `Preview import` button calling `importEventsPreview`, rendering valid rows preview table (including multi-room `VenueID` display) and itemized per-row validation errors
   - `Confirm bulk import` button (enabled only when preview is valid) calling `importEventsApply` with exact `previewDigest`, `expectedYearRevision`, and stable `operationId` persisted in `sessionStorage` for lost-response recovery / exact retry
   - `Check original import receipt` button (`eventMutationStatus`) for ambiguous outcomes
   - Automatic clear on `gsis:clear-protected-state`
3. Add Chromium + local Workers/D1 browser test `tests/v1-product-calendar-bulk-import-browser.mjs` proving:
   - Unauthorized user does not see / cannot use bulk import
   - Invalid row is surfaced in preview and blocks commit until corrected in UI
   - Multi-room (`VenueID: "v1,v2"`) rows preview and commit atomically
   - Stale preview after year revision change is refused (`409 REVISION_CONFLICT`) with zero partial writes
   - Exact retry with the same `operationId` is idempotent and creates no duplicate events

## Files Planned

- `docs/coordination/tasks/v1-calendar-bulk-import-ui.md`
- `v1/web/shared/calendar-ui.js`
- `tests/v1-product-calendar-bulk-import-browser.mjs`

## Out of Scope

- v0.9 source and generated files (`roster-update/`, `public/`, `shared/`) — zero drift required.
- Changing the existing `v1/services/calendar/bulk-import.mjs` Worker contract (already shipped in #243).
- Live Google Calendar sync, deployment, or live school records.
