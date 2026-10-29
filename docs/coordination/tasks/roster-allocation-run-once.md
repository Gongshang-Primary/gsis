# roster-allocation-run-once: stop the scheduled allocator retrying every minute

- Status: proposed (handoff to Codex; Codex claims by updating Owner and Status)
- Owner/model: Codex (proposed by Claude as architect, owner's directive 29 Oct: Codex implements)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 09:30
- Branch: codex/roster-allocation-run-once
- Base SHA: 4eb1208
- Current head SHA (or PR head; avoid self-referential commit hashes): none
- PR: none
- User-authorised scope: Song Wee, 29 Oct 2026: Friday 30 Oct production target; Codex does most coding.
- Files/domains owned (include generated outputs): backend scheduled allocation dispatch (`rosterScheduledDispatch_` and its slot/run records in backend/*.gs), shared/roster-operations.js only if the slot rule lives there, generated Roster/Deploy backends, tests.
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
