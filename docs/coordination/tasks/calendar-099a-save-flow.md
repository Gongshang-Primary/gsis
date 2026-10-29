# calendar-099a-save-flow: instant save receipt, stable weekly view, year-switch overlay, multi-venue chips

- Status: proposed (owner go 29 Oct 2026 for the D1-first receipt; Codex builds, not Friday-critical)
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 11:15
- Branch: codex/calendar-099a-save-flow
- Base SHA: 6fbad4e
- Current head SHA (or PR head; avoid self-referential commit hashes): none
- PR: none
- User-authorised scope: Song Wee, 29 Oct 2026: "accept D1, log together where it makes sense". Earlier 28 Oct requests: weekly view keeps edited cell; blur overlay on year switch.
- Files/domains owned (include generated outputs): calendar-job-worker/worker.mjs (enqueue), calendar-update/public/app.js (save flow, weekly view, year switch), calendar-backend/Code.gs only if execute must take over authorize checks, generated bundles, tests (tests/calendar-stable-view-browser.cjs and job worker tests).
- Out of scope: Roster, sync/publication flow, parent publishing rules.

## Part 1: D1-first save receipt (owner decision: accept into D1 first)
Evidence: `enqueue()` in calendar-job-worker/worker.mjs (~line 67) awaits `backend(...,'authorize')` before the D1 insert. Authorize runs in Apps Script under `withRC17WriteLock_` and reads the Events sheet (calendar-backend/Code.gs ~10197 to 10231): permission, pending-event check, revision conflict, archived year, `validateEvent_`. This Google round trip is what users see as "Saving Event / Writing event to the backend…". The real save then runs in the background (D1: last 10 jobs SAVED in 11 to 43 s, 1 dispatch each).

Required:
1. `enqueue` inserts into D1 and returns the receipt without calling Apps Script. Keep signature, actor binding, payload hash, capacity and per-event pending checks (all D1).
2. Prove `execute` re-runs every authorize check (permission, pending event, revision conflict, archived year, validateEvent_, relocate mode) before writing. Add any missing check to execute.
3. A rejected job (conflict, validation, permission) shows in the job panel with the existing conflict review, and the event view reverts to the saved version.
4. Keep cheap client-side validation in the form (required fields, end not before start) so common mistakes still show in the form.
5. Overlay closes within about 1 s of Save on a normal connection; the form closes on receipt.

## Part 2: weekly view keeps the edited cell (request 28 Oct)
Full analysis and acceptance checks: /docs/v099a/PENDING_CHANGELOG.md and the owner's pending changelog section "Weekly view keeps the edited cell in place after save". Summary: anchor on the edited event's `data-date`/`data-event-id`, not the first visible row; today jump only on first render per tab (in-memory flag plus sessionStorage); never after save, job update, refresh or year reload. Part 1 makes this more important: receipt and SAVED now arrive as two separate re-renders.

## Part 3: overlay while switching year (request 28 Oct)
Reuse `.sync-overlay` (blur, spinner) labelled "Loading <year> calendar…" on year change only; hide when rendered or on error; no flash for cached years (show after ~300 ms); never for background refresh or job updates.

## Part 4: several venues per event, as chips (request 29 Oct)
Today: one `VenueID` per event plus free-text `Location` (calendar-update/public/app.js venue picker; backend `calendarValidateVenue_`, calendar-backend/VenueDirectory.gs ~69 and Code.gs ~10306). Only Calendar reads `VenueID`; Roster and Venues do not.

Required:
1. Picking a venue from the suggestions adds a chip and clears the input for the next search. Each chip shows the unit and name ("B2-03 Oracle 2") with an x button on the LEFT of the label; x removes it. Keyboard: Backspace in an empty input removes the last chip; chips are focusable buttons with aria-label "Remove <venue>".
2. Typed text that matches no venue can still be added as one custom location (Enter), shown as a chip in a muted style.
3. Storage stays backward compatible: `VenueID` holds venue ids joined by "," in chip order (one id = today's format); `Location` holds the chip labels joined by ", " and is what Google Calendar shows.
4. Backend validates every id against the venue catalogue, rejects duplicates, caps at 6 venues, and keeps today's rules for one id and for custom text. Selecting venues still does not reserve them.
5. Edit, copy and relocate keep all chips; existing single-venue and custom events open unchanged.

Acceptance: picker unit test (add, remove by x, Backspace, custom chip, duplicate ignored); backend test (two valid ids saved, an unknown id rejected, legacy single id unchanged); browser check that the chip row wraps at phone width.

## Release note
`app.js` rejects a backend whose version differs from FRONTEND_VERSION. Ship frontend and backend as a matched 0.9.9a pair, or relax the check to the base version. Worker change ships with the pair.

## Acceptance checks
- Job worker test: enqueue makes no Apps Script call; execute rejects a stale revision, archived year, invalid event and non-editor.
- Browser test: save closes the form within 1 s with a mocked slow backend; rejected job shows conflict review.
- Part 2 and 3 checks as listed in the pending changelog.
