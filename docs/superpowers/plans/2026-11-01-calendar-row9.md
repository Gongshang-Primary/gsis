# Calendar row 9 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved task inline. Steps use checkbox syntax for tracking.

**Goal:** Accept Calendar save receipts promptly, preserve the edited weekly cell, show delayed year loading feedback and support up to six venue chips.

**Architecture:** D1 captures authenticated proposals without Google authorization latency. Existing Apps Script dispatch and mutation journal remain authoritative for roles, pending events, revisions, archive, validation and relocation. The frontend retains saved records until confirmation; view anchors and a separate year overlay are tab-local. Venue ids and labels remain comma-separated in the existing fields.

**Tech Stack:** JavaScript, Apps Script, Cloudflare Worker/D1, Node SQLite, jsdom, Playwright.

**Spec:** docs/coordination/tasks/calendar-099a-save-flow.md; docs/v099a/PENDING_CHANGELOG.md Calendar sections.

## Global Constraints
- Lane K only; no live changes, messages, deploy, shared helpers or version/release metadata edits.
- Base bb8d72d (tree a58e4e3210bcf52bb846abc1ec5249f1b00b28fd), exact-tree mirror of remote main 4a93be7.
- Build before npm test after switching branches. Use TZ=Asia/Singapore; retain all existing tests.
- Receipt means queued; SAVED requires Google confirmation. Preserve unknown outcomes and conflict recovery.

## Review Focus
- A role/revision/year changes after capture: execute denies before event writes.
- A receipt and subsequent SAVED rerender preserve the edited event offset with storage blocked.
- A deleted/moved event falls back to its original date without a deferred today jump.
- A year switch is superseded or fails: its overlay closes and old usable state remains.
- Existing single venue/custom text and an unavailable catalogue remain editable; unknown new ids never pass.

### Task 1: D1-first receipt
**Files:** calendar-job-worker/worker.mjs; tests/calendar-jobs/worker.mjs; tests/calendar099a-save-flow.cjs.
**Interfaces:** enqueue keeps public job contract; execute uses existing dispatch_/runEventMutation_.
- [x] Add and run red SQLite test proving enqueue never calls Google; change rejected authorization case to rejection during execute.
- [x] Remove enqueue authorize call. Prove direct execute without authorize rejects stale revision, archived year, invalid event, non-editor, pending event and invalid relocation mode.
- [x] Run focused job/backend tests and commit Model: Codex.

### Task 2: Venue chips
**Files:** calendar-update/public/app.js, styles.css; calendar-backend/VenueDirectory.gs and generated Code.gs/root Calendar copy; tests/calendar099a-save-flow.cjs; tests/calendar-jobs/ui.cjs.
**Interfaces:** VenueID joins ids with comma; Location joins ordered labels with comma-space. Form picker flushes uncommitted custom text on submit.
- [x] Add red tests for two valid ids, unknown/duplicate/over-six ids; picker add/remove/Backspace/custom/duplicate, legacy edit and relocation.
- [x] Implement minimal chips and backend validation; preserve legacy single id labels and custom text.
- [x] Run focused tests and commit Model: Codex.

### Task 3: Stable edit anchor and delayed year overlay
**Files:** calendar-update/public/app.js, index.html, styles.css; tests/calendar099a-save-flow.cjs; tests/calendar-stable-view-browser.cjs.
**Interfaces:** captureEventViewPosition includes event id/date plus fallback row; today jump has memory/token guard. Year overlay uses its own element and load sequence.
- [x] Add red jsdom geometry/timer regressions and browser acceptance cases for receipt/SAVED, blocked storage, move/delete, initial today jump and delayed/cached/error year switches.
- [x] Anchor at edit opening and restore safely through receipt/job refresh; cancel stale today callbacks. Show year overlay after 300 ms only for uncached user switches, below usable header; hide on render/error/supersede.
- [x] Keep cheap required/date/time validation before receipt submission.
- [x] Run focused tests; build canonical outputs and full npm test; record actual failures/omissions; commit Model: Codex.

### Task 4: Final verification and handoff
- [x] Review exact diff with a fresh read-only reviewer; address material findings with red/green checks.
- [x] Record all checks, unavailable Chromium/historical comparisons and remaining live gates in task record. Stage only lane K outputs and docs/tests.
- [x] Commit locally and hand root exact head/tree, path and summary. Root publishes remote CI; Claude reviews exact remote head; owner merges/deploys.

## Execution ledger
- Approved existing task is the design and execution authorization; no additional approval gate.
- Baseline build passed on 1 Nov 2026 SGT. Full baseline suite started; output outside worktree in calendar-row9/baseline-test.log.
- Task 1/2 shared interface: execute preloads venue catalogue; validation remains canonical in VenueDirectory.gs and generated Code.gs.
- Task 2/3 shared interface: modal opening captures original event/date before chips or work overlays can affect focus/layout.

- Task 1 complete: SQLite worker test RED (one Apps Script call at enqueue) → GREEN (zero); direct execute fence coverage and existing commands suite passed. No authorize implementation change needed: all fences already exist at dispatch/execute.

- Task 2 complete: multi-venue save and clear-search picker tests failed before implementation, then passed. Existing command/venue/core/job UI tests pass. Builder regenerated canonical Calendar Code.gs and root Calendar backend; no shared output changed. One free-text chip may appear anywhere among the selected venue labels. Legacy single-id labels and unchanged selections remain usable during a directory outage.

- Task 3 geometry/timer tests RED (no event anchor) → GREEN; rejected-job regression RED (old saved view) → GREEN. Initial today jump and blocked-storage startup, delayed/cache/error/superseded overlay, local date validation pass in jsdom. Chromium programs were attempted and fail to launch because `/tmp/chromium` is absent; these are pending exact-tree remote CI, not passes.
- Ruling: a failed user year switch restores the previously verified year and its prior editability; ordinary background-refresh failure still retains the existing read-only recovery rule. The previous data is unchanged and execution always rechecks current authority; cost if wrong is requiring a manual refresh of that previous year.

- Ruling: six means six total location chips, including the optional one custom chip, so the UI and backend enforce the same limit. Cost if wrong: the owner may later raise the total to permit six directory venues plus custom text.
- Extended coverage preserves comma-containing custom labels before/between/after two directory venues, and comma-containing venue names, without splitting existing free text. Current catalogues revalidate unchanged ids; unavailable catalogues retain unchanged historical selections under the existing compatibility rule.

- Final review of c786973: one Important overlapping-year fallback finding; no Critical or Minor findings. Fixed with uncached and cached intermediate-switch regressions RED → GREEN. The fallback now survives superseded requests and clears only on final completion or owner reset.
- Final affected verification after fix: build passed; 40/43 top-level Calendar programs passed. The only three failures are Chromium launch omissions (`calendar-stable-view-browser.cjs`, `calendar0810-birthday-responsive.cjs`, `calendar099-change-browser.cjs`); all are missing `/tmp/chromium`. Focused job wrapper passes but its browser subprogram is explicitly skipped by the pre-existing wrapper. Direct job browser invocation was also attempted and failed for absent Chromium. No browser/mobile/latency pass is claimed.
- Full `npm test` was invoked after baseline build and remains an incomplete local attempt; its logged failures include absent Chromium and `package.cjs` missing historical `2efd6e003fa9ee3846cf590d07902a22309861ff`. The suite began before implementation and is not exact-final-head evidence. Exact-tree remote CI remains the full-suite gate owned by root.
- Separate LORD `run_all_checks.py` attempt returned exit 1 without a final aggregate in its captured log; no green LORD claim. Its browser runner separately reports blocked for missing Chromium. Root CI must run the complete suite.
- Review limits retained: actual browser geometry/phone chip wrapping, real network receipt latency and live Apps Script/D1 integration were not judged locally; no live action was authorized or performed.
