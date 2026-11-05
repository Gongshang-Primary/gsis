# roster-d1-timetable-reconcile-cancels: on D1, every read cancels relief assignments ("effective timetable changed")

- Status: merged (#78 at a233adb as 324062a, owner "merge 78", 5 Nov); not yet in a release bundle. Release steps: Admin Stapler migration after deploy (see review)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 5 Nov 2026

## Incident: cutover attempt 4 (v0.9.9j), 5 Nov 2026
- Import completed 01:54 (316/316 parts; roster 18,905 records, roster-register 21). Activated 04:38:27 (both scopes active r2). Owner rolled back by the emergency route about 05:00 (Cloudflare legacy x3, edgeAuthorityRollbackToLegacy, venuesFenceDiagnose). D1 heads remain `active` (reset with "Reset D1 after manual rollback" before the next attempt). Evidence kept in D1.
- Good on D1: Assign Relief 5 Nov loaded in about 10 s; Auto-allocate 04:43 filled 35 of 38 periods and saved (roster r8).
- Fault: 04:47:08, a read-triggered reconcile (roster r10) cancelled all 35 assignments: cancellationReason "The effective timetable changed. Review and reassign this lesson." Repeated on later reads: by 04:56, 246 assignments for 2026-11-05 cancelled, 3 drafts left. Nothing else changed (an absence arrived later, r15).

## Code path
`roster-update/public/edge-roster.js` read handler (about line 116): for non-Stapler, non-record-only reads, `reconcileOperationalState(state,ctx)`; if it changes anything, a mutation runs with audit 'reconcile'. `reconcileOperationalState` (about line 403) invalidates every draft or published assignment for today or later whose `row.timetableId !== GSISRoster.active(ctx.timetableEntries,row.date).id`. `ctx.timetableEntries = register.state.entries` (D1 roster-register).

## Data (D1, read-only, 5 Nov)
roster-register entries:
| id | name | from | to | priority | pruned |
|---|---|---|---|---|---|
| 14a50c1e… | 2026 T4 post-psle wef 28 Oct 2026 | 2026-10-27 | 2026-11-20 | 11 | 0 |
| 1d28c523… | 2026 T4 (P6 Collasped) from 20 Oct | 2026-10-27 | 2026-11-20 | 12 | **1** |
| 26344705… | 2026 T4 Post-PSLE wef 19 Oct | 2026-10-18 | 2026-11-20 | 5 | 1 |
| f8738452… | 2026 T4 (P6 Collasped) from 15 Oct | 2026-10-14 | 2026-11-20 | 3 | 1 |
`GSISRoster.active` ignores pruned entries, so the active timetable for 5 Nov is **14a50c1e**. But **every** 5 Nov assignment written by Auto-allocate on D1 carries **timetableId 1d28c523 (pruned)**. So the reconcile is correct to flag them; the bug is that **the D1 allocation/day-build path uses the pruned entry 1d28c523**.

## Ask
1. Find where the D1 path builds the day / demand / candidate timetable for a date (day packages, timetable cache, R2 snapshot, Stapler baseline, `baselineDays`, published Deploy references #54) and why it resolves 1d28c523 instead of `GSISRoster.active` (14a50c1e). Check: a cached day package keyed only by date, a stale R2 timetable snapshot, or a resolver that ignores `pruned` or sorts by priority without the `pruned` filter. Show the same path on Google and why Google is right.
2. Fix so allocation, demands, reads and reconcile all use one resolver (`GSISRoster.active`, pruned excluded), and any cached day package is keyed by the resolved timetable id and invalidated when the register changes.
3. Safety: reconcile must never mass-cancel. If more than N (for example 5) assignments for a date would be invalidated by a timetable mismatch in one read, refuse, record a health alert, and leave the rows untouched for an SMC to review. Never invalidate published rows from a read-triggered reconcile without an explicit SMC action.
4. Tests: a register with a pruned higher-priority entry and an active lower-priority entry on the same dates → Auto-allocate then read: zero cancellations. Day cache keyed per timetable. The mass-cancel guard triggers. Google/D1 parity.
5. Add to the cutover acceptance test: Auto-allocate, reload twice, count unchanged.
Full suite green. Draft PR with the exact head for Claude. No deploy, no live D1 writes.

## Root cause found (Claude, 5 Nov ~09:00, read-only D1 + code)
- D1 `staplerPlans` for 2026-11-05: **confirmed, baselineId 1d28c523 (pruned)**. Neighbouring plans (2, 4, 6 Nov) use 14a50c1e (active).
- Allocation builds the Stapler-composed day: demands get `timetableId: d.id` (shared/roster-operations.js about line 241), and `composeStaplerContext` makes `d.id` the plan's baseline (1d28c523). So every 5 Nov assignment carries 1d28c523.
- The D1 read reconcile (`reconcileOperationalState`, roster-update/public/edge-roster.js about lines 403-406) compares `row.timetableId` with `GSISRoster.active(ctx.timetableEntries,row.date).id` (14a50c1e, the active baseline, ignoring the Stapler composition) and invalidates every row → mass cancellation on each read.
- The same function's first loop also treats a confirmed Stapler plan whose `baselineId` is not the active baseline as stale ("The active baseline timetable changed") for importedRelief/notifications, consistent with the plan being stale.
- So two defects: (A) **data**: the 5 Nov plan was confirmed on a pruned baseline (the Stapler should refuse or flag confirm/save on a non-active baseline, and existing such plans need an SMC "rebase or redo"); (B) **D1 reconcile** compares against the raw active baseline while allocation uses the Stapler-composed day; it must use the same effective day id as allocation, or treat the Stapler-plan mismatch as one SMC-visible issue, never a silent mass cancel. Check whether Google's reconcile has the same comparison (Google did not cancel on 5 Nov) and align both.
- Fix list: (1) one resolver for the effective timetable id (Stapler-composed) used by allocation, demands and reconcile on Google and D1; (2) Stapler plan on a non-active baseline: block confirm, show "Rebase to the current baseline", and list existing stale plans in System Health; (3) the mass-cancel guard; (4) tests with a confirmed Stapler plan on a pruned baseline.

## Owner ruling, 5 Nov: Stapler plans are delinked from baselines
Owner (verbatim): "i need stapler plans to be totally delinked from baseline, it is like a baseline duplicate of the day, then later cell-by-cell comparison for user to note only. any other baselines should be free to swap out, don't need to tie to baseline"

This replaces fix items (1)-(2) above for Stapler days:
1. A Stapler plan is a self-contained copy of the day's timetable, taken when it was created. It holds every cell it needs, so it never reads the baseline again. `baselineId` stays only as a record of where the copy came from (origin), never as a validity key.
2. On a date with a Stapler plan, the plan is the effective timetable. Allocation, demands, reconcile, export and notifications use the plan's own id on Google and D1. A baseline change, swap or prune never invalidates, cancels or marks stale a Stapler plan, its assignments, its imported relief or its outbox rows.
3. Baselines are free to be added, swapped, reprioritised or pruned at any time, even while Stapler plans refer to them as their origin.
4. Comparison is information only: Stapler shows a cell-by-cell difference against the current active baseline for that date (added, removed, changed cells), with no blocking, no automatic rebase and no "stale" status. An optional user action "copy this cell from baseline" may follow later; it is not in scope now.
5. Days without a Stapler plan keep today's behaviour (see the open question below).
6. Keep the mass-cancel guard (item 3) and the tests (item 4). Add tests: prune the origin baseline of a confirmed plan → no row changes on Google or D1; swap the active baseline → Stapler day unchanged, the difference view lists the changed cells; reload after allocate on a Stapler day → no invalidation.
7. Migration: existing plans (including 5 Nov on pruned 1d28c523) must already hold their full day copy; check this, and if any plan reads cells from its baseline, copy them into the plan once (before pruning ever removes the source).

Open question for the owner: on days WITHOUT a Stapler plan, when the active baseline changes, should existing assignments for lessons that no longer exist still be invalidated (current behaviour), or kept and flagged?
- Evidence for item 7 (Claude, D1 read-only): the 5 Nov plan record is only 1151 bytes (date, baselineId, revision, workloadWarnings, ...). It holds no day copy; it is an overlay that reads cells from its baseline. So delinking needs (a) the plan to store the full day snapshot at create/confirm, and (b) a one-time migration that copies each existing plan's day from its origin baseline. Pruned baselines are soft-pruned (`pruned=1`, entries kept), so the source for 1d28c523 still exists. Do not hard-delete any baseline before this migration runs.

## Owner answers, 5 Nov
1. Days WITHOUT a Stapler plan: when a baseline change removes a lesson, its relief assignment is released (the lesson no longer exists). Release only the rows whose lesson is gone; lessons that still exist on the new baseline (same day, period, class, teacher) keep their assignment. Released rows show "Lesson no longer in the timetable" in the audit and to SMC; the teacher's relief notice is withdrawn. The mass-cancel guard still applies (if a swap would release a large share of the day, stop and ask SMC/Admin to confirm).
2. Stapler difference view: show only. No per-cell copy action.

## Updated implementation claim (5 Nov 2026)

- Owner/model: Codex
- Reviewer: Claude, exact final head
- Branch: `codex/roster-d1-timetable-reconcile`; existing PR #78, one PR for this task
- Current main: `a2079f62241b8d4643da9410d7638a025a31b372`; previous PR head: `640d2b67515ff868a4cd0cf2902e7478d29cd133`
- Scope: shared Stapler full-day snapshots and effective-day resolver; Google/D1 adapters; lesson-specific reconciliation and guarded SMC confirmation; Admin dry-run/apply migration with preview digest; display-only cell differences; System Health; regression tests and canonical generated outputs.
- Acceptance: all five required scenarios in the owner's request on both routes; canonical build; full Node and LORD suite with counts; exact-head task handoff.
- Boundaries: no deploy, live D1/Google/R2 writes, authority changes, messages, baseline deletion, or unrelated lane work.
- Plan: establish failing retained-plan and removed-lesson fixtures; implement shared snapshot and resolver; add digest-bound Admin migration and informational difference UI; align reconciliation and notice withdrawal; verify both adapters and full suite; hand off #78 to Claude.
- The later owner rulings above replace the previous PR's active-baseline identity design. Published-row safeguards remain for unrelated changes. Small removed-lesson releases follow the final owner ruling directly; large releases require confirmation.

## Claude check of PR #78 (head 640d2b6, 5 Nov): needs rework to the owner ruling
#78 was built before the root cause and the owner rulings above. It conflicts with them:
1. #78 makes "operational IDs follow the active non-pruned register entry" on Stapler days. The ruling says the opposite: on a Stapler day the plan is the effective timetable; baseline changes never affect it.
2. #78 never lets a read cancel published rows and holds back any date with more than 5 affected rows. The ruling says lessons removed by a baseline change on non-Stapler days are released (including published ones, with the notice withdrawn); the mass-cancel guard stays, but as "a large share of the day", confirmed by SMC/Admin.
3. #78 has no plan day-copy, no migration and no difference view.
4. #78 is now in conflict with main (`dirty`). #79 is stacked on it.
Action: Codex reworks on the same branch (or a new PR that supersedes #78) to the prompt of 5 Nov; keep its good parts (shared Google/D1 reconcile path, preflight, idempotent health alert, reload-twice acceptance). Rebase #79 afterwards. Lane R stays serial: merge #80 first, then the reworked #78, then #79.

## Implementation handoff, 5 November 2026

Model: Codex. Reviewer: Claude. Status: implemented in draft PR #78; awaiting review and owner release decisions.

### Exact implementation and validation

- Accepted claim: `8914b6868ae0c9339351ae2d303af55e34234590`, task-only expected-head update before implementation.
- Main incorporated: `568576725f7656a9db2633ec92682a848a4d5d6f`, including #80. No clock fix was reverted.
- Exact implementation head: `6bd5f702ac3aff2170e3b7599d67507526d496ea`.
- Implementation tree: `6daf3b7fb4b6260e41b9d71bfc1566e16161250b`.
- Full CI: [run 41954352651](https://github.com/helper-gsps/gsis/actions/runs/41954352651), on that exact implementation head.
- Canonical `npm run build`: all 18 components regenerated.
- Full `npm test`, `TZ=Asia/Singapore`: 987/987 current Node programs passed across four shards (247, 247, 247, 246); 40/40 LORD check programs passed. No runner exclusion or CI gate was changed.
- Final focused checks: 126/126 passed after the final canonical build; additional publication/privacy set 116/116 passed, including 26 withdrawal tests and a 36-case ID/order/removal matrix. Includes real Publish + Notify flows, old/new communication captures, Google/D1 eligibility, exact-origin migration, private/public projection boundaries and repeated-read stability.
- This handoff follows the implementation in a documentation-only commit. The final PR head is recorded in the PR description for Claude; the code tree above is the tested implementation.

### Root cause and parity

The allocator composed the confirmed Stapler day from its saved plan while both legacy adapter reconciliation loops compared assignments and Stapler notices to the raw active baseline. On 5 November the origin was soft-pruned `1d28c523`, while the active register entry was `14a50c1e`. The mismatch was an identity/design error, not evidence that the independent Stapler day should be rebased.

Google also contained the same raw-baseline comparison (`rosterOperationsReconcile_`); it was not inherently correct. Compact report/entry, record-only and Stapler reads can bypass that path. The retained incident evidence does not establish which Google requests ran on 5 November, so this PR does not claim a proven operational explanation for its absence of cancellations. Both adapters now delegate to the same effective-day resolver and guarded reconciliation.

### Resulting behavior

1. New and confirmed Stapler plans retain a complete private day copy and their own timetable identity. Allocation, demands, exports, preload, Venues and notification eligibility use that saved day. Baseline add/swap/prune does not change it.
2. Admin migration previews all retained plan representations, including archived/confirmed/published copies, reads the exact origin including soft-pruned entries, and binds apply to the preview digest and request receipt. Missing or ambiguous source/native payloads block apply. Working tiles remain intact. Rerunning is a no-op; normal reads use no origin model cells afterwards.
3. Stapler comparison lists changed cells against the current active baseline. It is informational only; no stale status, rebase, reset or cell-copy action is exposed.
4. Ordinary baseline swaps release only absent-teacher lessons missing at the same date, period and class, with reason `Lesson no longer in the timetable`. Surviving cover remains; newly introduced workload conflicts are flagged for review.
5. More than five releases, or at least three releases comprising half the active assignments for the date, holds the entire date unchanged and creates a System Health review item. SMC/Admin confirms a fresh digest-bound preview. Other published changes triggered by reads retain their existing review gate.
6. Small removed published lessons are released under the final owner ruling. Saved publications and private links withdraw only those duties. Captured sent/provider evidence remains immutable. Unsent draft edits never become published through reconciliation. Combined duties retain surviving lesson details, instructions and the teacher's own lesson. Each further withdrawal needs a new acknowledgement; legacy grouped pending notices keep surviving duties. Withdrawal evidence binds already captured notices across assignment replacements and recipient changes; later restored and newly captured duties stay independent.
7. The cutover acceptance now requires Allocate, reload twice, and verify unchanged assignment count/identity. Regression fixtures repeat reads twenty times and cover both adapters plus local SQLite D1/R2 integration.

### Files changed from incorporated main

The implementation changes these files; this task record is the additional handoff-only change.

```text
CHANGELOG.md
Deploy_Backend_v0.9.9.gs
Roster_Backend_v0.9.9.gs
backend/Code.gs
backend/RosterOperations.gs
backend/RosterTimetableBatch.gs
backend/RosterTimetablePreparation.gs
backend/RosterVenues.gs
docs/v099/ROSTER_D1_CUTOVER_ATTEMPT3.md
notification-worker/dashboard-worker.mjs
notification-worker/dashboard-worker.txt
operations-worker/dashboard-worker.mjs
operations-worker/dashboard-worker.txt
roster-update/public/edge-roster-context.js
roster-update/public/edge-roster-domain.js
roster-update/public/edge-roster.js
roster-update/public/edge-timetable-cache.js
roster-update/public/roster-operations-model.js
roster-update/public/roster-stapler-model.js
roster-update/public/roster-stapler-ui.js
roster-update/public/roster-timetable-preload.js
roster-update/public/system-health.html
roster-update/public/system-health.js
roster-update/public/timetable-review.html
roster-update/public/timetable-review.js
shared/edge-notification-model.js
shared/roster-operations.js
shared/roster-stapler.js
tests/paid097-health-ui.cjs
tests/roster-d1-timetable-reconcile.cjs
tests/roster-stapler-delink-adapters.cjs
tests/roster-stapler-delink-domain.cjs
tests/roster-stapler-delink-preload.cjs
tests/roster-stapler-delink-storage.mjs
tests/roster-stapler-delink-venues.mjs
tests/roster-stapler-removed-publication.cjs
tests/roster-stapler-review-ui.cjs
tests/roster-venues-health-ui.cjs
tests/roster089-source-read.cjs
tests/roster090-multiple-absence.cjs
tests/roster093a-preload-local.cjs
tests/roster097-batch-backend.cjs
tests/roster097-confirmed-view.cjs
tests/roster098b-health-ui.cjs
tests/roster098h-stapler-domain.cjs
tests/roster098i-rehearsal.mjs
tests/roster098j-publication-compact.cjs
tests/roster098o-timetable-worker.mjs
tests/roster701-integrity-review.cjs
tests/roster707-backend-domain.cjs
tests/roster719-suspended-report-load.cjs
tests/stapler080-dates-contacts.cjs
tests/stapler098h-recovery-browser.cjs
tests/stapler716-canonical.cjs
tests/stapler717-reopen.cjs
timetable-prep-worker/domain.mjs
```

### Remaining evidence and release gates

No product decision is left open. The precise historical Google request sequence remains unverified as described above. No live retained-plan payload was read or migrated in this implementation session; Admin must review the production migration preview after an owner-approved release. Claude must review the exact PR head. The owner decides merge, deployment and cutover.

No deployment, live D1/Google/R2 write, real message, authority change, source-baseline deletion or live migration was performed. No approval is claimed. Existing cutover/rollback procedures remain in force; this change does not execute rollback or remove retained data.

## Claude review of PR #78 at exact head a233adb (5 Nov)
- Verdict: approve for merge (owner decides). Matches the owner rulings. CI full-suite green at a233adb (run 41955612198, 987/987 Node, 40/40 LORD). Claude locally at a233adb: the 8 new delink/reconcile/publication tests plus clock-minute, dependencies and day-transactions pass; canonical build leaves no diff.
- Checked: `effectiveDay` now takes timetable cells, teachers, timing and classes only from the plan's own `daySnapshot` (id `stapler:<date>`); only quota/cap evidence comes from the runtime day. The plan id and snapshot cannot be edited after save. `baselineChanged` is always false; the comparison returns an informational `differences` list (added/removed/changed). Non-Stapler days release only lessons missing by period, class and teacher; the guard (more than 5, or at least 3 and half the day) raises a TIMETABLE_RECONCILE_BLOCKED alert with a preview digest and needs explicit confirmation. #80's day token now uses the Stapler plan id on Stapler days.
- Correction to Claude's earlier note: the 5 Nov D1 row looked like an overlay because plans are stored packed. Each plan already held its original day in `plan.baseline` (tiles, teachers, classes, periods). The migration rebuilds `daySnapshot` from those embedded originals, not from the register, so pruned baselines are not needed.
- Release steps needed (Claude adds them to the release doc):
  1. After deploying the Roster backend and frontend: Admin opens Timetable review → Stapler migration → preview → check the digest → apply. Until then, legacy plans are snapshotted on their next save from their embedded originals.
  2. System Health: no TIMETABLE_RECONCILE_BLOCKED alerts left unexplained.
- Watch after deploy (not blockers): every plan now stores a full day copy (`daySnapshot`), so the Google operations state grows. Google speed is already an issue; check Assign Relief load time and the #80 preparation times on the first day.
- Doc fix for Claude after merge: the cutover acceptance line "each assignment uses the active, non-pruned timetable ID" must read "non-Stapler days use the active baseline ID; Stapler days use `stapler:<date>`".
