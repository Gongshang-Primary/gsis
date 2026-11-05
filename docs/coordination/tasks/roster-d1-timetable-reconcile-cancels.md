# roster-d1-timetable-reconcile-cancels: on D1, every read cancels relief assignments ("effective timetable changed")

- Status: open; Codex, lane R, TOP PRIORITY (blocks the D1 cutover)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 5 Nov 2026 05:10

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
