# roster-allocation-run-once: stop the scheduled allocator retrying every minute

- Status: ready for Claude review; locally verified with the baseline exceptions below
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 09:36
- Branch: codex/roster-allocation-run-once
- Base SHA: 77dbe38ac3243362493641869ffe1dcf82d2c8ae (accepted claim commit)
- Current head SHA (or PR head; avoid self-referential commit hashes): exact published review head is recorded in the PR description
- PR: https://github.com/helper-gsps/gsis/pull/7
- User-authorised scope: Song Wee, 29 Oct 2026: Friday 30 Oct production target; Codex does most coding.
- Files/domains owned (include generated outputs): backend scheduled allocation dispatch (`rosterScheduledDispatch_` and its slot/run records in backend/*.gs), shared/roster-operations.js for scheduled receipt/budget handling, bounded schedule/checkpoint additions in shared/roster-allocation.js, generated Roster/Deploy backends, tests.
- Out of scope: allocation rules and scoring, quiet mode (PR #5), D1 import, notification Worker logic.
- Acceptance checks: see below.

## Problem (evidence, 28 and 29 Oct 2026)
- `scheduledRoster` is called by the notification Worker every minute. On 29 Oct after 07:00 each call ran the allocator, hit the Apps Script time limit and was retried the next minute, all morning.
- Each run holds the single Roster script lock for most of its life and reads/writes the 13.7 MB `Roster operations.json`. While it loops, `claimNotifications` and `notificationResults` return 503: WhatsApp sent late (35 sent 06:55 but results failed to record; the rest ~07:21).
- D1 `gsis_job_health` on 28 Oct: `scheduledRoster` timed out 13 times 13:56 to 21:31 with no recorded success after 13:56.

## Required behaviour
1. A scheduled allocation slot for a date runs at most once to completion. Record the slot as done (success or final failure) so later minutes skip it.
2. A timed-out run counts as an attempt. After 2 failed attempts for the same date and slot, stop for that slot and record a visible "auto-allocation stopped" status for SMCs. No retry every minute.
3. A run that would not finish in the time left must stop early and save progress or give up cleanly; it must not hold the lock up to the hard limit. Use an explicit time budget well under the Apps Script limit.
4. A skipped call returns fast without taking the Roster lock or reading the operations file where possible (cheap check first).
5. Manual "Auto-allocate" by an SMC still works at any time.
6. Never change SMC overrides, protected or published cells (existing rule; keep it).

## Acceptance checks
- Test: 10 consecutive scheduled calls for one date with a run that times out → at most 2 allocator runs, then fast skips.
- Test: a successful run → later calls skip without the lock.
- Test: manual auto-allocate after a stopped slot still runs.
- Existing allocation and scheduled tests pass; generated backends rebuilt.

## Handoff
Needed for Friday 30 Oct 05:30 SGT run. Deploy with bundle A Thursday evening. Claude reviews the exact head SHA.

## Coordination
Owner's latest directive orders this task before chunked import. Reviews of PRs #2–#6 have been posted at their exact heads. Claude retains its existing PR branches and fixes; this task excludes their UI and quiet-mode logic. Only this allocator task is now claimed for implementation. Google remains authoritative; no production deployment, merge or authority flag change is included. Any later merge must regenerate shared bundles from the combined sources.


## Implementation decisions and source evidence — 29 Oct 2026

- This source already computes allocation outside the operational writer lock. Its scheduler only marks half-hour slots (previous day from 16:00 and overnight through 05:30), then 05:45 / 06:00 / 06:15 / 06:29 as allocation due. The reported “allocator every minute while holding the lock” is **not reproduced by this source**. Every minute did load operations before the idle decision, and failed runs had no persistent per-slot attempt limit. Live deployed code and logs still need comparison.
- `schedule.key` remains a minute-specific receipt identity. `schedule.allocationKey` identifies the most recent actual scheduled slot until the next slot; it is null from 06:30 to 15:59. A later minute retries only a slot already started; it does not create a missed slot. Existing distinct slots and the morning cutoff remain unchanged. Duplicate delivery of one failed minute does not spend its next attempt.
- A compact `ROSTER_ALLOCATION_SLOTS:<date>` Script Property records the attempt **before** intake/context/operations reads. Two attempts are permitted. A 150-second lease makes a killed computation recoverable; the writer lock and current durable receipt must prove its outcome before retrying. Accepted saves become completed, unreadable/unknown outcomes remain unresolved, and a replaced fence cannot submit a late proposal. The separate dated ledger survives replacement of the visible per-date run by a manual command.
- The calculation budget is 75 seconds from dispatch entry, additionally bounded by the scheduler timestamp plus 90 seconds. Save admission ends at 110 seconds from entry or 115 seconds from the original tick, whichever is earlier. This reserves time inside the existing 120-second stale-tick rule and well below the Apps Script execution limit. Optional checkpoints cover candidate preparation, coverage/flow search, consecutive-block search, local improvements and evidence creation in `shared/roster-allocation.js`; no score, objective, rule, ordering or node limit changes. Manual allocation supplies no scheduled budget.
- Budget exhaustion discards the unfinished allocation proposal and continues the existing due summary/reminder/report work where the remaining save budget allows. Minute receipts distinguish budget-only reporting from accepted allocation; recovery cannot mistake a saved report for an allocation success. The existing SMC run monitor receives a failed state and an explicit **Auto-allocation stopped after 2 attempts** log entry. Manual Auto-allocate remains available.
- A conservative 15-minute scheduling hint skips no-work ticks before full Google reads, intake gating or the operational lock. Due SMC times, 06:29/06:30 and any known published notices bypass it. Operations writes invalidate it by the existing version hint; a small `ROSTER_SCHEDULE_DIRTY` marker is set **before** the source write, so a failed post-write version update disables fast skips instead of hiding a new publication/configuration/absence change. Failure to persist that marker prevents source submission; a successful later version update clears it. The hint is derived only and has no allocation authority.
- Google remains the source of record. No D1 authority, import, quiet-mode, notification Worker, publication UI, scoring or permission changes. Allocation preparation remains outside the lock. Existing started/published/manual/peer protections remain in the same domain code.

## Local verification actually run

All commands used `TZ=Asia/Singapore`, Node 24.22.1. New `node --test tests/roster-allocation-run-once.cjs`: **18/18 passed**. Initial red evidence: 10/11 failed for missing slot identity, durable attempt claims, cheap skips, budgets, receipt recovery and checkpoints. Further red checks exposed cutoff settlement, failed version invalidation duplicate-minute attempt consumption, manual takeover leaving an expired slot unresolved, and missing scheduled-path visible-run cleanup before their fixes.

These 18 existing programs passed with `node tests/<file>`:

- `roster0812-allocation-run.cjs` — 17 lifecycle cases.
- `roster098m-anytime.cjs` — 11 manual/clock/protection cases.
- `roster098l-allocation-modes.cjs` — 9 mode/protection cases.
- `roster701-r17-core.cjs` — 16 policy/schedule cases.
- `roster701-r17-solver.cjs` — 70 seeded exhaustive-oracle comparisons and a 150-teacher / 60-demand synthetic case.
- `roster701-r17-integration.cjs` — 10 integration cases.
- `roster713-smc-summary.cjs` — 14 summary/delivery cases.
- `roster0812-human-decisions.cjs` — ownership/provenance regression.
- `roster085a-consecutive-backend.cjs` — 5 source/configuration cases.
- `roster701-r18.cjs` — 10 manual policy cases.
- `roster701-r19.cjs` — 5 instruction cases.
- `roster081-day-transactions.cjs` — 18 concurrency/receipt cases, including notification work during outside-lock allocation.
- `roster088-maintenance-intent-race.cjs` — notification-intent preservation.
- `roster093-allocation-reference.cjs` — 12 reference/freshness cases.
- `roster701-r17-service.cjs` — signed scheduler, replay and stale-tick handling.
- `roster096-scheduled-idle.mjs` — 13 existing edge-idle cases.
- `roster096-cron-idle.mjs` — existing recovery cron routing/idle behavior.
- `roster085-inbox-lock-scope.cjs` — current Inbox lock-scope checks.

The two `.mjs` programs emitted the existing Node `MODULE_TYPELESS_PACKAGE_JSON` warning; they exited 0. `git diff --check` passed. These checks are local/synthetic, not Apps Script timing, live morning throughput or provider delivery. No historical comparison was claimed. The implementer did **not** run builders, the full suite, browser checks or live operations: the controller owns generated-copy regeneration, full-suite evidence and the exact published review head.

## Migration, rollback and limits

No operator migration or new configuration flag is required. Dated attempt ledgers/hints initialize lazily; existing durable scheduled receipts remain authoritative. Each date's 32 slots fits below the 7,500-character guard. Terminal history older than seven days may be pruned; unresolved histories are retained, with a 14-date fail-closed bound. Old terminal visible scheduled runs are pruned with their dated ledgers; the existing manual-start history cap remains in place. Manual takeover resolves and closes an expired scheduled ledger under the same locked durable read before replacing its visible row. Do not delete unresolved records to reset a retry count.

Rollback: disable scheduled allocation and use SMC Auto-allocate, then restore the previously approved matched Roster/Deploy backend bundles if needed. Retain Google operation receipts, run records, slot ledgers and unknown outcomes. Old code ignores the added properties; reverting restores its old scheduler behavior, so keep scheduling disabled until reviewed. No authority flag change is part of rollback.

Cooperative checks cannot interrupt an individual blocked Google service call. A writer may still spend time reading/packing the large document under the existing final commit lock; this patch bounds repeated allocation and computation, not document storage or network latency. Cold/expired/invalid hints, due reporting and active published notices deliberately use authoritative reads. Timed-out reporting that cannot meet the save deadline remains uncommitted rather than being falsely acknowledged. Production load and exact deployed-source comparison remain release-owner gates.

## Next handoff

Claude reviews the exact published PR head. Owner retains merge/deploy approval. The implementation is not merged, deployed or live-verified. The owner-authorised next implementation is the separate chunked import branch; this allocation branch is handed off for review, with no further concurrent source edits planned. Regenerate shared bundles when integrating other Roster PRs.

## Controller verification and generated outputs

- `TZ=Asia/Singapore npm run build` passed, including the 86-file Apps Script syntax gate. Updated canonical backend copies, Roster browser/domain copies and both generated Worker bundle/text pairs. Notification and operations Worker entrypoint sources were not changed.
- `TZ=Asia/Singapore npm test` completed the JavaScript runner at **838/862 passing**, exit 1. Fifteen failures were missing Chromium paths and two were incomplete Script Properties mocks. The local browser paths were repaired; the two fixtures now model get/set/delete without changing their assertions. All **17 affected programs passed on rerun**, and the new allocation suite passed **18/18** again. This leaves seven baseline failures, not a green full-suite claim.
- All seven remaining failures reproduced on untouched claim base `77dbe38ac3243362493641869ffe1dcf82d2c8ae`: `package.cjs` lacks historical Git object `50c977d79c9756dfdbee91f2922f0cd89ab6e903`; `roster098o-preparation-package.cjs` and `roster098o-timetable-export.cjs` contain expired capture fixtures; `roster0811-school-absences-browser.cjs`, `roster0811-school-absences-ui.cjs`, `roster090-school-absence-pagination.cjs` and `roster702-operations-ui.cjs` have the pre-existing intake-read counts addressed by Claude PR #3. No unrelated source fix or comparison pass is claimed here.
- Because the JavaScript runner returned 1, `TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py` was run separately and passed. Historical comparisons explicitly excluded by the runner remain not run.
- An independent Codex preflight review found an orphaned scheduled ledger after manual takeover. The fix resolves the old durable receipt under the existing writer lock before replacement, and retains it on read failure. Reviewer recheck and the takeover/retention regressions passed. This does not replace Claude's required exact-head review.
- `git diff --check` passed. No live Apps Script timing, morning throughput, deployment, notification send or authority change was performed. `ROSTER_EDGE_AUTHORITY` remains unchanged.
