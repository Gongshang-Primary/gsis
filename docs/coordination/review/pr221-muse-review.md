# Muse review — PR #221: restore five-minute LORD teacher reminders

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #221, branch `codex/v1-lord-reminders`, OPEN, MERGEABLE.
- Exact head reviewed: `66109e48a6ad414bd3398ac7c0677157cf0078b3`.
- Base (merge-base of the head against origin/main at review time): `1abe47d039befd685a02c03ef8116278a12a2711` (claims/docs after deployed v1.06 `bd77b27`).
- Verdict: **APPROVED at the exact head.**

## What it fixes

LORD teacher reminders now use the v0.9 five-minute windows: collection only while BOOKED in `[start−5 minutes, start)`, and return only while COLLECTED with physical resources/accessories remaining in `[end−5 minutes, end)`. Explicit reminder disablement is honored when scheduling and immediately before dispatch. Native collection no longer creates a fixed 16:00 return reminder.

## Scope verified

- Diff is exactly the five paths in the task record `docs/coordination/tasks/v1-lord-reminders.md`: the task record, `tests/v1-product-lord-reminders.mjs`, `v1/services/lord/jobs.mjs`, `v1/services/lord/model.mjs`, `v1/services/lord/service.mjs`. 374 insertions, 50 deletions.
- `git merge-tree --write-tree --name-only origin/main 66109e4` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- Changed deployment component: LORD Worker only. No migration, frontend asset, dependency, workflow, provider/template configuration or live-data change. No deployment. No live data change.

## Design read

- `v1/services/lord/model.mjs`: one shared policy — `reminderPhase(payload, type)` classifies a job as collection or return; `remindersEnabled(settings)` keeps the existing scheduler default when the setting is absent and disables on explicit false/legacy 0 (an invalid enabled value never enables sends); `reminderEligibility(booking, phase, periods, settings, now, remaining)` returns blocked for an invalid context or missing period timings, suppressed for disabled reminders, changed booking state (collection needs BOOKED, return needs COLLECTED), no remaining custody on return, not-yet-due (`REMINDER_NOT_DUE`) or expired (`REMINDER_WINDOW_EXPIRED`), and ready only inside the window `[at−5 min, at)`, where `at` is the start-period start (collection) or the end-period end (return).
- `v1/services/lord/jobs.mjs` (`enqueueReminders`): computes due windows for today and the next five minutes' day boundary, then filters due windows and existing work **before** the bounded 100-row batch, so a non-due prefix cannot starve a due booking. Job IDs bind phase, window, booking revision and settings/timings revisions; guards bind booking status+revision and both settings revisions, so frozen jobs bind their original phase/window, booking revision and settings/timing generation. Return reminders use type `lord.return-reminder`.
- `v1/services/lord/service.mjs` (`collect`): no longer creates the fixed 16:00 return reminder — the owner scheduler creates return reminders only in the actual five-minute booking window. Historical fixed-time jobs stay intact. `notificationIntent`: for reminder-phase payloads it re-checks the shared eligibility at dispatch time, including the reminder-window key match (`REMINDER_WINDOW_CHANGED` when the window moved), so disablement and window changes are honored immediately before dispatch. `dispatchNotification` carries the phase through the reference-refresh retry.
- Existing template names/parameters, Core permission checks, current Contacts recipients, consent/agreement, sender/scheduler ownership, provider uncertainty and 18:00 physical-custody accounting remain. UAT010 hourly administrative monitoring is separate and unchanged. The generated scheduler remains minutely; no activation or configuration change.

## CI verified at the exact head

- Node/LORD run 44413233134: head_sha verified `66109e4`, completed success, all five jobs green.
- Product run 44415457203: head_sha verified `66109e4`, completed success, all 134 product programs.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-lord-reminders.mjs` — PASS (real built Worker/D1: native settings/booking/scheduler, non-due and due behaviour, duplicate scheduling, queued-setting revocation including legacy jobs, photo-backed collection, no new fixed 16:00 job; supplemental exact clocks over real owning D1: lower/upper bounds, more than 100 non-due bookings, resources/accessories, wrong states/dates/revisions, changed windows, old jobs, concurrent requests, accepted/uncertain evidence, actual Worker restart).
- `node tests/v1-product-lord.mjs` — PASS (unchanged, owner transaction).
- `node tests/v1-product-lord-notifications.mjs` — PASS (unchanged, including final Core/Contacts revocation and provider uncertainty).
- `node tests/v1-product-lord-recovery.mjs` — PASS (unchanged).
- `node tests/v1-product-lord-declarations.mjs` — PASS (unchanged).
- `node tests/v1-product-lord-reference.mjs` — PASS (unchanged).
- `node tests/v1-product-lord-cart-groups.mjs` — PASS (unchanged, 13 cart-group cases).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): meaningful actual built nine-Worker/D1 red — two collection channel jobs enqueued ten minutes early instead of zero. The passing state is re-verified locally above.
- N2 (integration evidence, not inclusion): a private pair-integration check with independent UAT010 `cf4caa0` (#225) has a clean merge-tree with no resolutions, and reminders + overdue both pass on the indexed union. That is integration evidence only; #225 is reviewed separately.
- N3 (limits, as stated): old fixed-time and late-overdue jobs remain recorded and are suppressed when no longer eligible; accepted/uncertain sends are never automatically replayed. Hosted scheduler timing, real provider delivery/template readiness, runtime UAT, T1B-01/T1B-02 and N-1 remain Not tested; F5 OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Coordinator-authorised bounded LORD repair; exact scope in the task record; source reference v0.9 `d9d180c` (`teacherMessageEligible_` / `scheduleTeacherWhatsApp_` / `deliverTeacherWhatsApp_`).
- Q02: Pass. Existing LORD scheduler/outbox/provider mechanism reused; no new data source or access path.
- Q03: Pass. Core permission checks, consent/agreement and sender/scheduler ownership retained.
- Q04: Pass. Duplicate scheduling, concurrent requests, accepted/uncertain evidence and Worker restart exercised; accepted sends never replayed.
- Q05: Pass. Bounded LORD Worker only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a code rollback preserving saved booking/outbox/provider evidence; it does not undo accepted sends.
