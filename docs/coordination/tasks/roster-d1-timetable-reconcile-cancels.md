# roster-d1-timetable-reconcile-cancels: on D1, every read cancels relief assignments ("effective timetable changed")

- Status: claimed; Codex, lane R, TOP PRIORITY (blocks the D1 cutover)
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

## Implementation claim

- Owner/model: Codex
- Branch: `codex/roster-d1-timetable-reconcile`
- Base SHA: `39b96c2ce0344d456f4867bbe02d6d007edfc3ac`
- Files/domains owned: shared Roster timetable/domain code, D1 edge day/reference resolution and reconcile health, focused tests, cutover acceptance documentation, canonical generated copies.
- Out of scope: deployment, live D1/Google/R2 writes, authority switches, fresh-start implementation (next task).
- Acceptance: reproduce the pruned-entry mismatch; one resolver and timetable-scoped day caches; published and mass-cancel guard; Google/D1 parity; Auto-allocate then reload twice unchanged; canonical build and full Node/LORD suite.
- Handoff: Claude reviews exact PR head; owner merges. No deployment.
