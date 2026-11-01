# calendar-099a-save-flow: instant save receipt, stable weekly view, year-switch overlay, multi-venue chips

- Status: implemented locally; exact-tree remote CI and Claude review pending (not merged or deployed)
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 1 Nov 2026
- Branch: codex/calendar-099a-save-flow-current
- Base SHA: bb8d72d5c08925fe56b0131eee674a66a630a2d5 (tree matches remote main 4a93be7)
- Current code head SHA: b352b0bc24fb2bd00029b48e6888c033af7c7391 (this handoff update follows it)
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

## Current execution
Bounded approved implementation plan: `docs/superpowers/plans/2026-11-01-calendar-row9.md`. Local branch only; no remote refs, live records, settings, notifications or deployment actions.

## Implementation handoff — 1 Nov 2026, Model: Codex

- Worktree: `/workspace/scratch/6ee09c260ea2/calendar-row9/source`; branch `codex/calendar-099a-save-flow-current`.
- Code commits: `105a03f` D1 receipt first; `a669a18` venue chips; `c786973` edited-event anchors, year loading and rejected-job recovery; `b352b0b` verified fallback across overlapping year switches.
- Authority: D1 acknowledges capture only. Worker authentication/signatures, actor binding, immutable payload hash/replay, D1 capacity and per-event ordering remain. Google execution still checks current permission, pending mutation, revision, archived year, event validation and relocation before any event write. No schema/configuration/authority changes.
- Receipt versus saved: forms close at durable acceptance. Existing saved events remain authoritative while a proposed tile shows its queued state. Rejected proposals leave the grid; a returned conflict updates the saved record only if no newer local revision superseded it. Save details retain the proposal and expose the existing conflict comparison; reviewing alone never sends another write. Explicit resubmission uses the latest reviewed revision and a fresh operation id. Unknown capture and dispatch outcomes keep their original identity/recovery rules.
- Weekly position: opening event/parent/relocation editors records the edited segment/date; captures prefer the visible edited card and keep a separate date fallback. Receipt/SAVED/refresh restores cancel any deferred today jump. Tab memory plus guarded session storage enforce first entry only, including storage denial. Existing custom text and single venue labels open unchanged.
- Year feedback: uncached explicit switches show the existing blur/spinner style below the header after 300 ms; cached and background reads skip it. Sequence checks and a retained verified fallback handle superseded success/failure. Failed explicit switches restore the original verified year/editability; ordinary background failure keeps the pre-existing read-only recovery behavior.
- Locations: selected chips show `unit name`, a left removal button, accessible removal labels, Backspace removal, keyboard suggestions and one custom chip. `VenueID` contains ids in chip order; `Location` contains ordered chip labels joined by comma-space. Commas inside a legacy custom location or known venue label are retained. Six means six total chips, including the optional custom chip (implementation ruling); backend and frontend enforce the same total. Backend rejects unknown/duplicate ids and revalidates unchanged ids when the current directory is available; unchanged historical selections retain the existing outage compatibility rule. Move/copy preserve all fields. Venue selections do not reserve rooms.
- Canonical generation: `npm run build` passed after the final product fix. Only Calendar backend copies and Calendar job Worker bundles are included; no Roster/Deploy/notification/operations/LORD or shared release/version files changed. Component runtime versions remain the existing matched `0.9.9`; root owns release/build-label work.

### Evidence and remaining gates

- Behavioral RED → GREEN: enqueue makes zero Apps Script calls; multi-venue save and clear-search chips; six-total-chip validation; edited card offset; rejected saved-view/conflict recovery; overlapping uncached and cached intermediate year-switch failures.
- Final Calendar sweep: **40/43 top-level programs pass** with `TZ=Asia/Singapore`. The only failures are `calendar-stable-view-browser.cjs`, `calendar0810-birthday-responsive.cjs`, `calendar099-change-browser.cjs`, each unable to launch absent `/tmp/chromium`. No browser pass is claimed. `calendar-jobs/browser.cjs` was also attempted directly and failed for the same omission; the existing job-suite wrapper explicitly skips it without Chromium.
- Focused 12-program sweep passed before the final narrow year-race fix; affected view, rejection, command and legacy venue checks were rerun and pass. The final 40-program sweep covers the updated source and all four new row-9 programs. Syntax checks and `git diff --check` pass.
- Full `npm test` was invoked after the baseline build. It is an incomplete local attempt begun before implementation, not exact-final-head evidence; observed failures are absent Chromium plus `package.cjs` lacking historical commit `2efd6e003fa9ee3846cf590d07902a22309861ff`. No full Node pass is claimed. Separate LORD full-run attempt returned exit 1 without a final aggregate in its captured log; its browser runner explicitly reports blocked for absent Chromium. No LORD pass is claimed.
- Fresh read-only review covered exact `c786973`, found one Important overlapping-year fallback bug, and no Critical/Minor findings. That bug was reproduced RED and fixed at `b352b0b`, with uncached and cached intermediate regression cases GREEN. No deferred code findings remain from that review. Root/Claude still review the final published head.
- Outstanding: root publishes the exact tree and runs full remote Node/LORD/browser CI; Claude reviews that exact remote head; owner decides merge and deployment. Real-browser geometry/mobile wrapping, normal-network receipt latency and live Apps Script/D1 integration remain unverified locally. No deployment, live configuration/data mutation, provider message or reservation was performed.

### Rollback
Revert the Calendar task commits as one matched frontend/backend/Worker source change and rebuild canonical Calendar outputs. No migration or live-state cleanup is required; preserve all accepted job/Google mutation identities and unknown-outcome history. Deployment/rollback remain owner actions.
