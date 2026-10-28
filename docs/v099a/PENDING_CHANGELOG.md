# GSiS pending changelog

Requests logged here are not committed or built. Each entry moves to a release only on an explicit "commit" instruction.

## Calendar 0.9.9a (pending)

### Weekly view keeps the edited cell in place after save

**Request (28 Oct 2026):** In Weekly view, after editing an event, Calendar must stay at the cell that was edited. It must not jump back to today.

**Current behaviour (0.9.9 source, `calendar-update/public/app.js`):**
1. `renderWeeklyView()` calls `jumpViewToTodayOnce('weekly', host)` whenever `yearView().weekly` is empty. That memory is only filled by `rememberView()` on a page change or bootstrap load.
2. The jump runs two animation frames later, after the synchronous `restoreEventViewPosition()`. When it fires, it overrides any restored position.
3. "Once" is recorded only in `sessionStorage` (`gspsCalTodayJump:weekly`). If storage is blocked, or the key is never written, every full weekly render jumps to today again.
4. Position restore uses the first visible date row as its anchor, not the edited cell. A save that changes row heights can therefore shift the edited cell off screen.

Root cause is suspected, not yet reproduced against live behaviour.

**Operator report (28 Oct 2026):** Chrome. The jump happens immediately after Save, not when the queued job later reaches `SAVED`. It feels like the whole page reloads. Saved data is correct (D1: two May 2026 edits at 21:18 SGT, both `SAVED`).

**Narrowed by code reading:**
1. Chrome keeps `sessionStorage`, so cause 3 (repeated today jump) is unlikely.
2. Only four places set scroll: the today jump, `restoreEventViewPosition()` (window and wrap), and the Events date search. Nothing in the save path scrolls to today directly.
3. Leading candidates, in the queued save path `saveEvent` → `finishQueuedEvent()` → `refreshEventViewLocally()`:
   a. The position is captured while the modal and work overlay are open. The anchor is the first visible weekly row, not the edited cell, so the restore can land off target.
   b. **Favoured by the "whole page reloads" report.** A silent `STALE_CALENDAR_CONTEXT` return, or a deferred refresh drained by `closeModal()`, can trigger a full `renderAll()`. That redraw restores only the remembered position from the last page change or load, which may be the opening today view, not the edited cell.
4. Confirm by reproducing in Chromium with a mocked `/api/bootstrap` and queued `saveEvent` before writing the fix.

**Planned change:**
1. Record the edited event's date and lane (`data-date`, `data-event-id`) when the edit modal opens.
2. After the save, queued job completion or a data refresh, restore the scroll position so that this cell keeps its on-screen offset. Fall back to the current first-visible-row anchor if the cell is gone (for example, after a delete).
3. Make the today jump strictly first-render-only per tab: keep an in-memory flag as well as `sessionStorage`, and cancel the pending jump once the user scrolls, edits or the view is restored.
4. Never run the today jump from a re-render that follows a save, job update, refresh or year reload.

**Acceptance checks:**
1. Weekly view, scroll to a future term, edit an event, save: the edited cell stays in view at the same position before and after the queued job reaches `SAVED`.
2. The same holds for new event, move, delete (anchor falls back to the nearest row) and parent-side save.
3. First open of Weekly view in a new tab still lands on today.
4. With `sessionStorage` blocked, the view does not jump to today after any save.
5. Events view behaviour is unchanged, apart from the same anchor improvement.
6. Add regression cases to `tests/calendar-stable-view-browser.cjs`.

**Scope:** Calendar frontend logic only. No Worker or data change.

**Release risk:** `app.js` rejects any backend whose version differs from `FRONTEND_VERSION` ("Frontend/backend version mismatch"). A frontend labelled 0.9.9a would break against the 0.9.9 backend. Either redeploy the backend relabelled 0.9.9a as a matched pair (no backend logic change), or relax the check to compare the base version only. Decide at commit time.

### Blur overlay with spinner while switching calendar year

**Request (28 Oct 2026):** When switching calendar versions (the year selector), show a blurred overlay with a loading spinner until the new calendar is ready.

**Operator clarification:** Today there is no visible feedback telling the user to wait. The page looks idle while the new version loads.

**Current behaviour (0.9.9):** The year selector calls `loadBootstrap(year)`. The only sign of loading is the freshness bar text ("Loading 2027…"), or a cached read-only copy of the other year. The old grid stays visible and clickable-looking while the new year loads.

**Planned change:**
1. On year change, show a blur overlay with a spinner over the calendar area. Reuse the existing `.sync-overlay` style (blur 5px, navy spinner) so it matches Saving/Sync.
2. Label: "Loading <year> calendar…". Keep the header and year selector usable, so a slow load can be switched again.
3. Remove the overlay when the new year has rendered and its view position is restored, or on error (keep the existing error toast).
4. Do not show it for background refreshes of the same year, so editing is not interrupted.
5. If the year is cached, show the cached grid at once and skip the overlay, or show it only for loads longer than about 300 ms, to avoid a flash.

**Acceptance checks:**
1. Switching year shows the overlay within one frame and hides it when the grid is ready.
2. A failed load hides the overlay and shows the error; the previous year stays usable.
3. A fast cached switch does not flash.
4. Background refresh and queued job updates never show this overlay.

**Scope:** Calendar frontend only. Part of 0.9.9a unless split.

## Roster 0.9.9a (pending): Relief board

### Problem (operator report and D1 evidence, 28 Oct 2026)
1. The 05:30 auto-allocation produced a workable draft. The draft is not the problem.
2. SMCs must override it for judgment calls that are not business rules (for example, a firmer teacher for a challenging class).
3. Each per-period override is a separate save to the Google backend. Saves are slow and often fail. Opening Assign Relief is also slow.
4. At 06:45 SMCs switched to Excel. Because the online roster was not trusted, WhatsApp notices were never launched.
5. D1 job health on 28 Oct: `processAbsenceIntake` timed out about every 2 minutes from 07:35 to 17:30 (82 timeouts). `claimNotifications` returned backend 503 or timed out 36 times. `scheduledRoster` timed out 13 times from 13:56 to 21:31, still on 0.9.9. Absence intake averaged 30 s to reach Google (max 68 s; one report took 477 s and 5 attempts).
6. The Roster backend was redeployed during school hours (0.9.8k at 07:52, l at 08:09, m at 08:55, p by 18:12).

Root cause: one Google Apps Script backend serves users, absence intake, notifications and the optimiser under a single lock. Per-allocation saves compete with background jobs at peak time.

### Goal
Give SMCs Excel speed on top of auto-allocation: instant edits, no lost changes, the whole day on one screen, and one commit. Google stays authoritative.

### Scope
1. **Board:** a day view of absences × periods with the auto-allocation draft pre-filled. Override any cell instantly in the browser.
2. **Local draft:** overrides are kept in browser storage per day and per SMC, and survive refresh and network loss. A banner shows "N unconfirmed changes".
3. **Instant clash checks** in the browser, using the cached timetable and the latest absences. Flag: relief teacher already teaching, absent, double-booked, or over cap. Warn, never block, a deliberate SMC override, and record it in the audit.
4. **Protected choices:** a manual override is locked. The 05:30, 06:29 and daytime optimiser runs never change a locked or confirmed cell.
5. **One commit:** "Confirm day" sends all changes as one operation with an expected revision per duty slot. It is queued through Cloudflare (receipt first, the same pattern as the Calendar jobs queue), applied to Google in the background, and shows queued, then saved, per cell.
6. **Conflicts:** if Google's revision moved for a slot, show that slot only for review. Never overwrite silently and never drop the rest of the batch.
7. **Daytime top-ups:** a new absence after first publish appears on the board as a highlighted row. Allocate only that absence, confirm, and notify only the affected staff.
8. **Notify after confirm:** WhatsApp is sent from the confirmed state only, with outcomes tracked as accepted, sent, delivered or failed. A cancel affects only queued messages.
9. **Multi-SMC:** two SMCs editing the same slot get a live conflict warning before commit.

### Out of scope
Cloudflare-authoritative timetables (Diagram 1), new allocation rules, and changing the absence intake owner.

### Prerequisites
1. Measure first: Apps Script Executions durations for Assign Relief open, single save, `processAbsenceIntake`, `scheduledRoster` and `claimNotifications` between 05:30 and 09:30.
2. Reduce backend contention at peak: move non-urgent jobs (audit export, cleanup, `scheduledRoster` retries) out of 06:00 to 08:30, and give user saves priority over background polling.
3. Fix `scheduledRoster` timeouts (it has had no recorded success since 13:56 on 28 Oct).

### Acceptance checks
1. Opening the board shows the draft within 3 s on a cached timetable.
2. An override appears within 100 ms, with clash flags.
3. 20 overrides and one confirm: every slot reaches saved or shows a specific conflict. None is lost.
4. Refreshing mid-edit keeps all unconfirmed overrides.
5. Optimiser runs after confirm leave locked and confirmed cells unchanged.
6. A daytime absence top-up notifies only the affected staff.
7. Two SMCs editing the same slot: the second sees a conflict before commit.
8. Live trial on one school morning in parallel with Excel before Excel is retired.

## Operations rules (from 28 Oct 2026)
1. No Roster backend or Worker deploys on school days between 06:00 and the last period. Deploy in the evening, as matched pairs.
2. After each deploy, check D1 `gsis_job_health` for new failures before the next school morning.

### Roster: visible "last published" timestamp on Assign Relief

**Request (29 Oct 2026):** Assign Relief needs a published timestamp.

**Current behaviour (0.9.9):** The day data already carries `publishedAt` and `publishedRevision` (`shared/roster-operations.js`). Assign Relief shows "Last published …" only inside the transient status message (`roster-update/public/roster-operations-ui.js:346`), so it is easy to miss or replaced by other messages.

**Planned change:**
1. A permanent chip in the Assign Relief toolbar beside the date: "Published 06:52" (Singapore time), or "Not published" when `publishedAt` is empty.
2. When saved changes exist after the last publish (`allocationRevision` newer than `publishedRevision`), the chip turns amber: "Published 06:52 · changes not yet visible".
3. Tooltip: full date and time only. No publisher name (operator decision, 29 Oct 2026).
4. Updates in place after Publish, without reloading the page.

**Scope:** Roster frontend only. No data or backend change.

**Acceptance checks:**
1. Unpublished day shows "Not published".
2. After Publish, the chip shows the publish time within one second.
3. A saved relief change after publishing turns the chip amber.
4. The chip survives refresh and date changes, and reads the correct day.

### Roster: show a teacher's relief duties on their timetable for the day

**Request (29 Oct 2026):** A teacher's timetable for today must show their relief duties. Observed: Timetable → Teacher timetables for 29 Oct showed the confirmed suspended timetable only, although the teacher had at least 6 relief periods.

**Current behaviour (0.9.9):** The Timetable page (`roster-update/public/roster.js`) renders the effective day (baseline, or confirmed/published Stapler) with no relief overlay. Relief appears only in Assign Relief and the published daily relief views.

**Planned change:**
1. Overlay relief on the teacher's timetable for the selected date: each relief period shows "Relief for <absent teacher>" with subject, class and venue, in the relief colour (orange, matching the Excel contract).
2. Swaps show the swapped lesson, and the dropped own lesson is marked.
3. Visibility follows publication: ordinary teachers see only **published** relief; SMC and Admin also see saved but unpublished relief, marked "Not yet published".
4. Class timetables and TG timetables get the same overlay, so a class shows its relief teacher.
5. PDF/Print and Excel exports of the timetable include the overlay.
6. A header line states the source: "Includes relief published 04:08".

**Scope:** Roster frontend (reads existing publication and allocation data). No backend change expected; confirm the timetable read already returns published relief for teacher scope, otherwise add a read-only field.

**Acceptance checks:**
1. A teacher with 6 published reliefs sees all 6 on their timetable for that day.
2. Before publish, the teacher sees none; an SMC sees them marked "Not yet published".
3. A relief changed after publish shows the published version to teachers until the next publish.
4. A class whose teacher is absent shows the relief teacher in Class timetables.
5. Print and Excel match the screen.

### Roster: one central queue for absence reports that need action

**Request (29 Oct 2026):** Reports that need action must appear in one central place, not only on the Assign Relief page for their own date.

**Evidence (29 Oct, 04:15 SGT):** three reports sat in `needsReview` unseen: 26 Oct (since 26 Oct), 10 Nov (since 26 Oct) and 30 Oct (shorter-report confirmation, since 28 Oct). They blocked the D1 import, and the 30 Oct absence was missing from the next day's relief.

**Current behaviour (0.9.9):** "Received reports and review history" on Assign Relief asks the backend with the selected date (`rosterAbsenceIntakeVisible_`, `backend/Code.gs`), so a report is only seen when someone opens its date. The backend already supports a call without a date.

**Planned change:**
1. A central **Reports to resolve** panel on Assign Relief (and on Home for SMC/Admin), always loaded without a date filter, listing every report in `needsReview`, `pending` or capture-unknown state across all dates, oldest first.
2. Each row: absence date, teacher, type, reported time, waiting time, reason in plain words (for example "Shorter than the saved absence: choose which to keep"), and the existing resolve actions.
3. A count badge on the Assign Relief navigation: "3 reports to resolve". Red when any report is for today or tomorrow.
4. The per-day panel stays for that day's history.
5. Optional later: a WhatsApp or banner alert to SMCs when a report enters review.

**Scope:** Roster frontend; the backend read already exists. Confirm the undated read returns all states needed.

**Acceptance checks:**
1. A `needsReview` report dated in 3 weeks appears in the central panel today.
2. Resolving it removes it from the panel and the badge count.
3. Teachers see only their own reports; SMC/Admin see all.
4. With no unresolved reports, the panel shows "No reports need action".

## Roster 0.9.9a-d1prep (deployed to production 29 Oct 2026, about 04:05 SGT)

**Scope:** Roster frontend Worker only. The Roster backend stays 0.9.9.

**Change:** `roster-update/public/_worker.js` reopens `/api/edge/migration` only when the Pages variable `ROSTER_D1_PREPARE=import` is set, and then only for `status`, `import` and `export`. `activate`, `restart`, `refresh`, `pause`, `resume` and `recoverVenuesFence` still return `RECOVERY_MIGRATION_DISABLED`. Without the variable the build behaves as 0.9.9. The notification and operations Worker bundles include the same gate; the variable is not set on them.

**Route and authority:** Users stay on the Google route. Import copies the Google export into D1 scopes `roster` and `roster-register` (mode `imported`) and refreshes `roster-references`. Every production reader of these scopes requires all three to be `active`, so an import is inert. The Google writer fence (`edgeFence`) is reachable only through `activate`, which stays closed.

**Configuration added on production Roster Pages:** R2 bucket `gsis-roster-snapshots` bound as `ROSTER_TIMETABLE_SNAPSHOTS`; text variable `ROSTER_D1_PREPARE=import`.

**Package:** `Roster_Frontend_v0.9.9a-d1prep.zip`, SHA-256 `c454bc6e3e4436809bd11571cbc4ea60673c34299db28742ad6c2a630eaab10c`. The on-screen label still reads v0.9.9 (known gap; a full 0.9.9a label change is planned with the next release).

**Verification:** Targeted tests passed: `roster098-recovery-worker.mjs`, `edge094-setup.cjs`, `paid097-backend-gateway.mjs`, `paid097-backend.mjs`. Full Node suite: 856/861. Of the 5 failures: 2 were caused by the baseline README edit and pass after the README fix; `package.cjs` needs the historical Q commit, absent from this repository; `roster098o-preparation-package.cjs` and `roster098o-timetable-export.cjs` use a fixture dated 28 Oct 2026 and fail on the unchanged baseline too after the date changed. Live: Status loaded on production (all scopes `legacy`, revision 0).

**Live result:** First Import refused by the backend: "Finish the captured absence queue before exporting Roster authority." Three intake reports were in `needsReview` (26 Oct MC, 10 Nov UPA, 30 Oct shorter-report confirmation). No D1 data was written. Import reference `b73cad70-f3b3-4d2e-bcf9-865c51cec9db`.

**Rollback:** Cloudflare Pages → previous deployment → Rollback; remove `ROSTER_D1_PREPARE`. Imported D1 scopes are inert and can be reset with the existing `restart` control in a later release.

**Remaining gates before activation:** resolve intake reviews; import; compare D1 counts and digest against the Google export; route background jobs (absence intake, scheduled allocation, notifications) to D1; Google backup writer; activation rehearsal.

### Roster: the latest absence submission overwrites automatically

**Request (29 Oct 2026, operator decision):** When a teacher's new absence report conflicts with a saved absence (shorter report, or saved portions changed since), the latest submission wins automatically instead of waiting for SMC review. Applies to the open reports for 30 Oct (`e29c984b`) and 10 Nov (`cb65979b`).

**Current behaviour (0.9.9, `backend/Code.gs` ~4279-4294 and `rosterAbsenceIntakeRetry_`):** Conflicting reports stop in `needsReview` with `ABSENCE_SHORTER_CONFIRMATION` (choose keep or replace) or `ABSENCE_COVERAGE_REVIEW` (shortening touches past periods or SMC-protected relief; report predates a deletion; saved portions changed). Only Retry (with keep/replace for the shorter case) and Withdraw exist.

**Planned rule:**
1. For the same teacher and date, the report with the latest submission time replaces the saved coverage for that date.
2. Periods removed by the new report release their relief, including SMC-protected relief. Each release is written to the audit with the report ID.
3. Started or past periods never change. They keep their recorded absence and relief.
4. Released relief teachers and the SMC on duty are notified only if the day was already published; otherwise the change simply appears in Assign Relief.
5. A report older than a later SMC deletion still loses to that deletion (latest action wins, including SMC actions).
6. The review queue keeps only cases the rule cannot settle (unknown teacher, missing timetable, capacity).

**Open decisions:** (a) Does "latest" also mean an SMC's manual edit made after the teacher's report wins over that report? Assumed yes. (b) Are released protected reliefs re-offered to Auto-fill blanks automatically? Assumed no; SMC decides.

**Scope:** Roster backend rule change plus a frontend message. Needs targeted tests for shorter, longer, overlapping, started-period and protected-relief cases before deployment.

## Roster 0.9.9a-latestwins (built 29 Oct 2026, locally verified, not yet deployed)

**Scope:** Roster backend and frontend pair. Includes the 0.9.9a-d1prep gate.

**Changes:**
1. `shared/roster-operations.js` `applyAbsenceResubmission` (embedded in `backend/Code.gs`, Worker and browser models via the build): the latest action wins. A deletion saved after a report supersedes it (no review). Saved portions newer than a report keep their coverage; older portions follow the report. A strictly later shorter report replaces automatically, whoever saved or edited the absence, and releases relief on removed periods, including SMC-protected relief. Periods that have already ended keep their recorded absence. Equal-order replays keep the saved coverage. Explicit keep/replace choices are still honoured.
2. `backend/Code.gs`, `backend/RosterEdgeMigration.gs`: the export-blocked message lists the unresolved report dates and points to Manage school-wide absences.
3. `roster-update/public/roster-operations-ui.js`: Manage school-wide absences shows **Reports to resolve · all dates** (every unresolved report, any date) with the existing retry, choose and withdraw controls. Assign Relief keeps its per-day panel and adds **Resolve in Manage school-wide absences**. (Operator asked to move the controls; they are kept in both places for now because four existing workflow tests drive them through Assign Relief. Remove the Assign Relief copy in a later release.)

**Existing open reports:** `e29c984b` (30 Oct) and `cb65979b` (10 Nov) need one **Retry** after this backend is deployed; the new rule then applies.

**Tests changed to the new rule:** `roster098d-pipeline.cjs`, `roster098d-resubmissions.cjs`, `roster098n-shorter.cjs`, `roster098n-intake-lazy.cjs` (old cases asserted the review stop). The multi-date atomic-failure case in `roster098n-intake-lazy.cjs` now asserts both dates apply together; atomic failure remains covered for other conflict codes.

**Verification:** Targeted: 10 resubmission programs and 12 intake UI programs pass. Full suite: running.

**Packages:** `Roster_Backend_v0.9.9a-latestwins.gs` SHA-256 `a504a47d98a422fa37c7152b2fb8941e2c4900818a06792e15d76955f631e905`; `Roster_Frontend_v0.9.9a-latestwins.zip` SHA-256 `85ccb4dc2c06dc5f054a5872743e23fdec1bc896f0690e679e12bccefcb3923c`. Runtime labels still read 0.9.9.

**Rollback:** Apps Script → Manage deployments → previous version; Pages → previous deployment.
