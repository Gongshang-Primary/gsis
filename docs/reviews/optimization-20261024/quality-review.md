# Independent code quality and performance review

24 October 2026, Singapore. Draft comparison against `8b0d350` (v0.8.11a). Review only; no source edits, commit, deployment or live service changes by this reviewer.

## Scope

Reviewed the changed canonical sources in `backend/RosterOperations.gs`, `backend/RosterTimetableBatch.gs`, `shared/roster-operations.js`, `roster-update/public/roster-timetable-preload.js` and `roster-update/public/roster-stapler-ui.js`, their relevant projection, validation, persistence and cache callers, and the new regression tests. Applied the Thermonuclear structural review contract and Vercel correctness, performance and reliability checks.

No remaining material code quality or performance blocker was established in the final reviewed diff. The changes reuse existing command, validation and cache boundaries without introducing a second storage system or weakening write validation.

## Findings resolved during review

1. Proposed explicit Refresh coalescing used a local completion timestamp. A response captured before another planner's save could arrive after that planner requested Refresh, causing stale reuse. The optimization was removed; explicit Refresh retains its own server check.
2. The corrected backend can replay an earlier accepted Confirm while returning a current restored draft. The UI still said the plan was confirmed. The message now distinguishes the earlier accepted command from the current unconfirmed draft.

## Independent verification

Passed these programs against the reviewed working source:

- `tests/stapler0812-backend-recovery.cjs`: matching revision uses one incremental tile check; replay metadata remains coherent with the current plan; receipt recovery retains payload binding.
- `tests/roster-next-window-source.cjs`: includes the 27 existing backend batch checks, then verifies unchanged window reads after an outside-window write, day rollover and the day +30 boundary.
- `tests/roster089-cache.cjs`: unchanged generations avoid payload work; incomplete suspended deltas recover through a full stage instead of relabelling old contents.
- `tests/stapler0812-draft-recovery-browser.cjs` in Chromium: compact pending recovery retains the exact command, storage failure blocks first dispatch, lost Confirm responses survive context reload, and restored-draft replay messaging matches current state.

The browser fixture retained its table DOM and scroll position of 1,500 after unchanged Confirm. A merged server change replaced the visible content and retained that viewport. Its dirty local draft occupied 1,342,545 characters; the pending record occupied 1,342,776, an addition of 231 characters. These are fixture storage lengths, not a production latency benchmark.

An intermediate browser test failed because its newly added reload scenario reset the viewport before a later assertion. The fixture now explicitly sets the intended viewport before that scenario; the independent rerun passed.

## Limits

This was a scoped review of the draft and relevant dependencies, not a claim that every repository line was audited. Generated bundles rely on the parent's synchronization checks. The parent owns full-suite results. Live Apps Script concurrency, service latency, school data and installed deployment versions were not measured. Server content tags control response reuse only; current permissions and mutation constraints remain authoritative on the server.

## Morning allocation and human decision addendum

Expanded the review to the allocation run lifecycle, named human decision provenance, conflict choices, essential audit exports, active run panel, cancellation recovery and scheduler report continuity. Read the canonical changes in `backend/RosterAllocationRun.gs`, `backend/RosterOperations.gs`, `backend/RosterAuditExport.gs`, `shared/roster-operations.js`, `roster-update/public/roster-operations-ui.js`, its stylesheet, the backend error envelope, gateway Calendar bypass and release inclusion.

No remaining material code quality or performance blocker was established in the final reviewed source. The run property contains bounded display and control metadata. Durable completion and cancellation reuse the existing operational receipts. Calculation stays outside the writer lock; final cancellation checks and assignment commits use that same lock. A delayed property update cannot override a durable outcome. Manual decision tokens include a server-generated identity, so identical values and identical timestamps cannot hide an intervening human edit.

The following issues were resolved during this expanded review and the parallel correctness review:

- Five-second status polling initially entered the full operations read path. Status-only polling now avoids operations document and timetable index reads; full version checks retain their separate cadence.
- Same-request retry reset its log sequence while the UI rejected older sequences. Retry now retains a monotone bounded sequence and uses a new internal attempt fence.
- Essential conflict audit events were suppressed again by the export layer when verbose logging was off. Capture, archive and export now retain the essential evidence.
- Lifecycle recovery codes were lost in the backend error envelope, causing the UI to discard uncertain commands. The safe code allowlist and real signed gateway regression now cover them.
- A per-date status marker alone could forget a cancelled command after a later run replaced it. A durable cancelled receipt prevents resurrection, and receipt lookup explicitly reports cancellation rather than accepted allocation.
- An old cancellation request could leave a successor run's Cancel control disabled or attach old feedback to it. Accepting a successor resets the cancellation state; late responses are scoped to their original run.
- A duplicate scheduler delivery for the same active slot could fall back to report-only processing and replace the solver's receipt. The fallback now rejects that duplicate with the existing in-progress outcome, preserving the original allocation. Reporting alongside a different busy run remains supported.

The final scheduler path also separates a cancelled or blocked allocation from scheduled reports. Its report-only retry preserves the allocator's fence and does not rerun the cancelled calculation.

Independent checks passed against the reviewed source:

- `tests/roster0812-human-decisions.cjs`: same-clock ABA, fresh explicit override, Keep online without false editor attribution, stale review rejection, atomic audit/replay, release-to-automatic tombstone and essential named text export with verbose logging disabled.
- `tests/roster0812-allocation-run.cjs`: all 17 lifecycle regressions, including lost write responses, final cancellation gate, expired attempts, cancellation receipt persistence, old-command resurrection prevention, status storage failure, scheduled report continuity at the morning cutoff and duplicate same-slot scheduler delivery.
- `tests/roster0812-allocation-monitor-browser.cjs` in Chromium: minimise and Cancel during a held request, exact retries, successor-run cancellation isolation, typing focus preservation, durable module reload recovery and storage failure guards.
- `tests/roster097-batch-errors.mjs`: lifecycle codes cross the real signed backend and gateway envelope; cancellation does not depend on a Calendar fetch.

One intermediate lifecycle run failed after the scheduler report-only behavior changed but before its test expectation was updated. The coordinated source and regression update passed the independent rerun.

These are deterministic fixtures and simulated interleavings, not a production load benchmark. Thirty status-only fixture calls performed no operational document or timetable index reads. Every real request still performs fresh Contacts authority/directory verification; a five-second cadence across 30 active viewers can produce up to 360 status requests per minute. No live quota or latency claim follows from the fixture. Full version checks remain separate. Concurrent same-day human or absence changes can safely stop manual auto-allocation with a conflict requiring review and retry; the patch does not promise transparent success amid every concurrent write. The review remains scoped to these changes and their relevant dependencies, not an exhaustive audit of all GSiS code.
