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
