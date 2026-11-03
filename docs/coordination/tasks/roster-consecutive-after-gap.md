# roster-consecutive-after-gap: consecutive check ignores timetabled periods after a free period (bug)

- Status: investigating - owner answers received 4 Nov, plan omission ruled out, new investigation below
- Owner/model: Muse
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-04
- Branch: muse/roster-consecutive-after-gap
- Base SHA: 45c70bf539ebb6e4accd1f9192ba2ef20e398c61
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: Lane R by owner exception 3 Nov 2026 (LANES.md Muse pilot section). `shared/roster-allocation.js` and the Stapler-plan occupancy code it reads (`shared/roster-stapler.js`, specifically `effectiveDay`, which produces the day `teacherSource` reads via `composeStaplerContext`), generated backends/bundles only via `npm run build`, tests.
- Files/domains owned (include generated outputs): `shared/roster-stapler.js`, `tests/roster098k-consecutive-after-gap.cjs` (new), generated backends/bundles via build, this task record.
- Out of scope: edge authority, import, mirror, Venues fence, notification code (Codex's open lane R work). If the fix needs those, stop and ask Claude. No live data, no deploy, no merge.
- Acceptance checks:
  1. Stapler day, unchanged teacher, P5 and P7 to P12 with P6 prospective: violation.
  2. The same on a baseline day: violation (guards against regression).
  3. A real gap (P5, P8 to P12, P6 prospective): run of 2, no violation.
  4. A Don't-need-relief subject still counts as occupied.
  5. A consecutive-exclusion subject is still excluded.
  6. A teacher whose Stapler plan does change keeps the plan's periods, not the baseline's.
  Full suite: `TZ=Asia/Singapore npm test`. All CI shards must be green. Draft PR naming Claude as reviewer, with the exact head SHA. Do not claim results that are not in CI.

## Decisions and changes

- Claim note: WORKFLOW describes a claim-only commit to main, but the pilot rule is never push to main. As with Tasks 1 and 2, the claim is recorded on the task branch only, not on main. The user-given reference "main @ 5464087" resolves, via the branch commit list, to commit `5464087f47bf862a5a7f708888816eb02290d56e` ("Assign roster-consecutive-after-gap to Muse"). Current main `45c70bf539ebb6e4accd1f9192ba2ef20e398c61` is its successor (it reassigns the task back to Muse after a brief reassignment to Codex), so the branch starts from current main.
- Fix (in `shared/roster-stapler.js` `effectiveDay`, the Stapler-plan occupancy code that produces the day `teacherSource` reads): after building plan teachers and filling cells from active plan tiles, (1) a plan teacher with no lesson tiles at all in the plan keeps the baseline day's cells, and (2) a baseline day teacher who is not in `plan.teachers` at all is added with the baseline day's cells. A teacher the plan does cover, including one whose cards are all in Card Pit, keeps the plan's cells, never the baseline's. No change to the six-consecutive meaning, to `maxConsecutivePeriods`, to `runAt`, to `consecutivePeriods`, or to the consecutive-exclusion filter. No edge authority, import, mirror, Venues fence or notification code was touched.
- Report: Chuan Song, 2 Nov (a Stapler day), P6 free, own lessons P5 and P7 to P12. Assigning relief at P6 should make P5-P12 a run of 8 and trip the six-consecutive rule. It did not. Chuan Song's day was unchanged from baseline. Some of their periods are on the "Don't need relief" list. They are NOT on the consecutive-exclusion list. Periods on "Don't need relief" still count as occupied.

## Step 1 reproduction finding (recorded before the fix commit)

Fixture (local, `roster-test/repro2.cjs`, not committed): baseline day, 17 periods, Chuan Song cells at indices 4 (P5) and 6-11 (P7-P12), P6 index 5 free, subjects EL with TL at indices 7 and 9 (TL is a Don't-need-relief family subject, reliefRequired false in the default families, and not in `consecutiveCountExclusions`).

Baseline day:
- `teacherSource` base: [4, 6, 7, 8, 9, 10, 11]
- `consecutiveBase`: [4, 6, 7, 8, 9, 10, 11]
- `periodCount`: 17
- `runAt(P6)`: 8
- `eligibility` consecutive: 8, `streakViolation`: true

Stapler day, plan whose teacher list and tiles do not cover Chuan Song (plan baseline is a subset day with only the other teacher; the plan changes only that teacher, so it does not change Chuan Song):
- `teacherSource` base: []
- `consecutiveBase`: []
- `periodCount`: 17
- `runAt(P6)`: 1
- `eligibility` consecutive: 1, `streakViolation`: false

Cause that holds: (a) the Stapler plan drops an unchanged teacher's periods.

Code lines, `shared/roster-stapler.js` `effectiveDay` (line 228 in the branch version read):
- `out.teachers = plan.teachers.filter(...).map(t => ({...clone(baselineTeachers.get(t.staffId) || {}), ...clone(t), cells: empty}))`
- then only `active(plan)` lesson tiles fill cells: `teacher.cells[t.period] = cell(plan, t)`
- Baseline day teachers (`day.teachers`) are only used to spread fields onto plan teachers. A baseline teacher who is not in `plan.teachers` gets no row at all, and a plan teacher with no tiles at all in the plan gets empty cells. `teacherSource` in `shared/roster-allocation.js` then builds `base`/`consecutiveBase` from `dd.teachers` only, so the dropped teacher's periods vanish from the run.

Causes ruled out in this fixture:
- (b) multi-period blocks counted once: the baseline tiles are one per period (7 tiles for P5, P7-P12), and baseline `base` includes all 7. No block expansion issue is present here.
- (c) `periodCount` too short: `periodCount` is 17 on both the baseline day and the Stapler day. The right-hand scan in `runAt` (`shared/roster-allocation.js`, line 284) is not truncated in this fixture.
- Consecutive exclusion: `consecutiveCountExclusions` is empty in the fixture, and TL (Don't-need-relief) is counted on the baseline day, as required.

Note on scope of the reproduction: a Stapler plan created from the *full* baseline day via `S.create` does NOT reproduce the bug (both days give run 8, violation true). The drop happens when the plan's coverage does not include the unchanged teacher, not for every Stapler plan. That is why the fix must retain baseline occupancy only for teachers the plan does not cover, and must not restore baseline periods for a teacher the plan does cover (see acceptance check 6).

## Verification

Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

Local, before the fix: new test `tests/roster098k-consecutive-after-gap.cjs` fails at the first test (actual consecutiveBase `[]`, expected `[4, 6, 7, 8, 9, 10, 11]`), exit 1. After the fix, all 8 checks in that file pass.
Local, after the fix, in a repo-shaped copy (`TZ=Asia/Singapore`): `node tests/roster098k-consecutive-after-gap.cjs` (8 pass), `node tests/roster084-stapler-unchanged.cjs` (9 pass), `node tests/roster084-consecutive-subjects.cjs` (16 pass), `node tests/roster098k-suspended-rules.cjs` (node:test, 0 fail), and `node tests/roster098h-stapler-domain.cjs` run from the copy root (12 pass). `node --check` passes for the changed product file and the new test file.
Not run locally: `npm run build`, `npm test` (full suite), `python3 lord-suite/tests/run_all_checks.py` (Playwright not in workspace). Those run in CI; the draft PR is opened only after full CI is green, and no CI result is claimed here yet.

## Claude ruling and read-only investigation, 2026-11-04 (no fix yet, no PR)

Claude ruling, relayed by the owner on 2026-11-04: do NOT narrow the revival to `teacherSource`. Allocation and venues must agree on who teaches on a Stapler day. The `effectiveDay` change is reverted locally (local copies back to blob `47c041c47962cb3ddbe14cd0b2d47e5ff1ae6372`, the pre-fix shared file); the branch still stands at head `8245697` with the fix, the new test and the generated outputs, pending this ruling. No branch file was changed by this investigation, and no PR is open. No live data was read by Muse for this investigation.

CI context that forced this investigation: CI run 225, attempt 2, on head `8245697` failed with Regression shards 1/4, 3/4, 4/4 passing, shard 2/4 failing, and full-suite failing only because a shard failed. The single failing script was `tests/venues-sources.cjs`, line 24, assertion "a teacher omitted from the final dated plan is not revived from the recurring comparison". Locally, with the original Stapler file that test passes fully; with the fixed file it fails at the same line. `rosterVenuesDay_` in `backend/RosterVenues.gs` builds its base day from the full week blocks and calls `GSISRosterStapler.effectiveDay(confirmed.plan, base)`, so the fix revived the omitted teacher's Lab venue there.

Correction to the Step 1 finding above: the mechanism is confirmed (if a plan omits a teacher, `effectiveDay` drops that teacher from `dd.teachers`, and `teacherSource` then has no base for them), but live-plan omission for 2 Nov is NOT proven by the earlier fixture. That fixture built a plan from a subset day, which is equivalent to an imported subset-baseline plan, not to a baseline-derived saved plan. The question below is therefore whether the real 2 Nov plan omitted Chuan Song, and if so by which path.

### 1. Every path that creates or changes a confirmed plan's teacher list

Code references are to the branch version (`shared/roster-operations.js` operations, `shared/roster-stapler.js` model). "Can omit an unchanged teacher" means the confirmed plan's `plan.teachers` can lack a teacher who taught the baseline day, with no validation failure.

- `createStapler` (`shared/roster-operations.js` `createOrImportStapler`, via `shared/roster-stapler.js` `createStandalone`): YES, by construction. A standalone plan starts with `teachers: []` (`createStandalone` calls `create` with `teachers: []`), and the planner adds only the teachers they add (`S.apply` `addTeacher`). The UI message is "Standalone plan created. Add verified teachers and your classes, then Save and Confirm." A standalone plan confirmed as-is lists only the teachers the planner added. It is not a baseline-derived plan.
- `importStapler` (`createOrImportStapler`, via `importNative`): YES, if the imported payload's own baseline is a subset. `importNative` only validates the payload against its own `plan.baseline` (`shared/roster-stapler.js` `validate`, lines 124, 146-148: baseline cards retained, baseline teachers not removable, but only against the payload's own baseline). There is no check in `createOrImportStapler` that the imported plan's `baselineId` matches the current baseline timetable for that date, or that its teachers cover the current baseline teachers. An imported subset-baseline plan can therefore be saved and confirmed with a teacher missing.
- `saveStapler`, baseline-derived (`shared/roster-operations.js` `staplerApply`, `saveStapler` branch): NO. The plan sent by the planner is validated with `validate(plan, {baseline: previous, previous})`, where `previous` is the saved draft or, if none, `staplerBaseline` = `S.create` of the full baseline day. That validation requires `plan.baseline` to equal the previous baseline exactly, and requires every `plan.baseline` teacher to be in `plan.teachers` with the same name and timetable name. A client plan that drops a baseline teacher fails validation.
- `saveStapler` via surgical patch (`applyStaplerPlanPatch`) or merge (`mergeStaplerPlans`): NO. Both end with `validate(next, {baseline: current, previous: current})`, so deleting a baseline teacher from `plan.teachers` fails the same baseline-teacher check. Patch collections are `tiles`, `mats`, `teachers`, `classes`, but a teacher deletion does not survive that final validation for a full-baseline plan.
- `confirmStapler` (`staplerApply`, confirm branch): NO change to the teacher list. It copies the saved draft, runs `validateStaplerPlan` (double-booking and absence guards only), sets status confirmed, and stores the draft as `confirmedPlan`. An omission, if present, was already in the draft.
- `restoreStapler` (`staplerLifecycle`, both the reset-archive and deleted-plan branches): NO change to the teacher list. It copies the archived draft or published plan verbatim (and, for a reset archive, preserves the confirmed snapshot). An omission, if present, was already in the archive.
- `renameStapler` (`staplerLifecycle`): NO. Name only, revision increments.
- `moveStapler` (`staplerLifecycle`, via `shared/roster-stapler.js` `redate`): NO drop; it adds teachers. `redate` adds every destination baseline teacher to `plan.teachers` if missing, and adds their destination tiles (or pits the old teacher's tiles when the teacher was in the old plan). The destination baseline becomes the plan's new baseline.
- `resetStapler` / rebuild after a baseline change (`staplerApply`, reset branch, via `staplerBaseline`): NO drop. The new draft is `S.create` of the full current baseline day, so `plan.teachers` is the full baseline teacher list.
- In-plan edits (`shared/roster-stapler.js` `S.apply`): NO teacher removal. There is no `removeTeacher` command. `move` and `pit` move tiles, `suspend` pits a teacher's tiles for a period range, `addTeacher` adds a teacher. A suspended or pitted teacher stays in `plan.teachers` with empty cells, which is the correct non-revival case and is distinct from a teacher missing from `plan.teachers` entirely.
- `publishDay` / published plan (not a `staplerApply` operation): NO change to the teacher list. It stores `readyStaplerPlan` (draft or published, if confirmed or published) verbatim as the published plan.

Fixture check with the original `effectiveDay`, same 17-period shape as Step 1: baseline-derived plan (full `S.create`, other teacher's tile moved) gives effective teachers `[chuan, other]` with Chuan Song occupied at indices 4, 6-11. Standalone plan (only the other teacher added) gives effective teachers `[other]` only, Chuan Song missing. Imported subset-baseline plan (created from a day with only the other teacher) gives the same missing result. Redated baseline-derived plan gives both teachers again. So the only fixture types that reproduce the bug are standalone and imported subset-baseline, not baseline-derived save, confirm, restore, rename, move, or reset.

### 2. Does the 2 Nov plan omit Chuan Song?

Not established from code alone, and no live data was read by Muse. The earlier fixture does not establish it, because it was built by the subset method, not by the baseline-derived save method. The owner lookup below is the exact check needed. Until it is answered, neither A nor B below is proven for the real plan.

Owner lookup, for the Roster Stapler record for 2026-11-02 only (do not send staff personal data beyond what is already in this task record):
1. Plan record: name, revision, status (draft, confirmed, or published), confirmed date and confirmer if confirmed, and `baselineId`. Does `baselineId` start with `standalone:`, or does it equal the 2 Nov baseline timetable id?
2. Audit trail for 2026-11-02, in order: which operations ran (`createStapler`, `importStapler`, `saveStapler`, `confirmStapler`, `restoreStapler`, `moveStapler`, `resetStapler`), by whom, and at what time? Was the plan created standalone, imported as a native draft, or started from the baseline?
3. Confirmed plan's `plan.teachers` list: is Chuan Song present, with what staff id, name, and timetable name?
4. Confirmed plan's `plan.baseline.teachers` list: is Chuan Song present there? Is `plan.baseline` the full 2 Nov baseline, or a subset?
5. Confirmed plan's `plan.tiles` for Chuan Song: grid lesson tiles at periods P5 and P7-P12, Card Pit tiles (location `pit`, period null), or no tiles at all?
6. Baseline day for 2026-11-02: timetable id and parity, and Chuan Song's cells at P5 and P7-P12 (subject, class, venue), to confirm the baseline side matches the report.

If the answer to (3) is that Chuan Song IS in `plan.teachers`, then plan omission is ruled out for the real plan, and the bug lies elsewhere (not in `effectiveDay` teacher-list handling). If the answer is that he is missing, then (1), (2), and (4) decide between A and B below.

### 3. A or B

- (A) A path drops unchanged teachers by mistake: NOT supported for any baseline-derived path. Save, confirm, patch, merge, restore, rename, move, and reset all preserve or add baseline teachers, and validation blocks removal from a full baseline. A fix "at that path, so every baseline teacher stays in the plan with baseline cells" has no target path identified among baseline-derived operations.
- (B) Plans list only covered teachers by design: SUPPORTED for standalone and imported subset-baseline plans, which by construction list only the teachers the planner added or the payload covered. If the 2 Nov plan was one of those types, then B holds for that plan, and venues would indeed also be wrong for it under the current shared `effectiveDay` semantics, because allocation and venues read the same effective day. That is an owner ruling question, not a code question: is a standalone or imported plan for a school day supposed to represent the whole day (in which case the creation/import path must be fixed to include every baseline teacher with baseline cells), or only the teachers it covers (in which case the 2 Nov report's expectation that Chuan Song's baseline lessons count is inconsistent with that plan type, and the plan itself, not `effectiveDay`, needs correction)?

Recommendation to Claude, for ruling: do not restore the `effectiveDay` revival, and do not change `tests/venues-sources.cjs`. First answer the owner lookup in section 2. If the plan was baseline-derived and Chuan Song is in `plan.teachers`, investigate the allocation path again from that plan, not from a subset fixture. If the plan was standalone or imported subset, rule on whether that plan type must carry every baseline teacher, and fix at the creation/import path if so.

No PR until Claude rules on A or B, as instructed.

## Second investigation, 2026-11-04 (read-only, before any new fix)

Owner answers on main at a38b174: the real 2 Nov plan was created from the online baseline, Chuan Song was in it, and his schedule was as per baseline. Plan omission is ruled out. The effectiveDay revival on this branch is to be dropped. Shared effectiveDay and tests/venues-sources.cjs stay unchanged.

Baseline-derived fixture, traced from confirmed plan to eligibility (local, original shared files, no live data): full baseline day, 17 periods, Chuan Song cells P5 and P7-P12 (indices 4, 6-11), P6 free, other teacher's tile moved, plan confirmed via composeStaplerContext. Result, Stapler day and baseline day identical: base [4,6,7,8,9,10,11], consecutiveBase [4,6,7,8,9,10,11], periodCount 17, runAt(P6) 8, eligibility consecutive 8, streakViolation true. With R verified, automaticStreakViolation true and autoEligible false for EL/TL subjects. So a simple EL/TL baseline-derived plan does NOT reproduce the bug in eligibility.

Test results, with code references:

1. Tiles to cells: lesson tiles are single-period. S.create creates one tile per baseline cell, with no durationMinutes (shared/roster-stapler.js create, lines 64-66). effectiveDay fills only teacher.cells[t.period] for each active lesson tile (line 228). span() for a lesson tile returns only its start period, because end = p.start + (p.end - p.start) for non-recess tiles, while durationMinutes is used only for recess tiles (span, line 23). A manually built lesson tile with durationMinutes 60 at period 7 gave span [7] and effectiveDay occupied [4,6,7] only, missing period 8. So a duration lesson tile would be counted once, but S.create never creates one, so this is NOT the cause for a baseline-derived plan. It is a latent quirk, not the proven cause, and it is not fixed here.

2. Period mapping: plan.periods = clone(day.periods) in S.create, effectiveDay periods = plan.periods, teacherContext periodCount = dd.periods.length (shared/roster-allocation.js line 278), cells indexed by period value in effectiveDay. With 1-based periods (values 1-17, lessons at values 5, 7-12, prospective 6), periodCount 17, base [5,7,8,9,10,11,12], consecutive 8, streakViolation true, automaticStreakViolation true. Period mapping does NOT break the run. The runAt right-hand stop at total only matters if total is less than the highest period, which is not the case here.

3. Teacher identity: teacherSource finds a row by staffId, with phone-alias joining (shared/roster-allocation.js lines 265-266: blocks keyed by staffId, linked people by mobile, t = joined.find(t => t.staffId === person.id)). With a mismatched person id and no phone link, base is [], t is false, eligibility available is false with reason "No active verified timetable", consecutive 1 (prospective only). That is ineligibility for all periods, not a silent streak miss. It does NOT explain the reported bug, where the teacher was considered for P6 and the streak did not trip. With matching staffId (owner answer), the row is found and base is full.

4. Don't-need-relief, manual consecutive: NO removal on the Stapler path. teacherSource filters activities only by consecutiveCountExclusions (shared/roster-allocation.js line 275), not by reliefRequired or noReliefSubjects. effectiveDay fills every grid lesson tile regardless of subject. Publication copies cells verbatim (dailyPublication in shared/roster-operations.js). So TL, and also PD/BLK, are in consecutiveBase on both baseline and Stapler days. Manual consecutive is 8 in all variants tested.

4b. Don't-need-relief, AUTOMATIC streak: THIS HOLDS, and is the only silent bypass found. Automatic streak uses workloadBase, not consecutiveBase: eligibility automaticStreakViolation = longestRun(consecutivePeriods(t, [...], true), periodCount) > limits.consecutive (shared/roster-allocation.js line 301), and violation() uses consecutivePeriods(t, rows, true) (line 396). workloadBase excludes non-workload activities (shared/roster-allocation.js line 266: activity.kind !== null and (teaching or cap or invigilation)). PD gives kind nonTeaching, cap false; BLK/BLOCK gives kind null; any subject with category Non-teaching gives kind nonTeaching, cap false. With R verified, a PD variant (PD at indices 7 and 9, EL elsewhere) gives: consecutiveBase [4,6,7,8,9,10,11], workloadBase [4,6,8,10,11], eligibility consecutive 8, streakViolation true, automaticStreakViolation false, autoEligible true, category 2. The same result holds on a baseline day and on a Stapler day, so it is not Stapler-only, but it is exactly the reported shape: periods on the Don't-need-relief list (default noReliefSubjects PD, BLK, BLOCK, IMP) are occupied for manual consecutive, but are dropped from the automatic workload run, so automatic allocation assigns a teacher whose run should trip the rule. Manual assignment is different: it allows with a warning, because streakViolation is a warning, not a reason.

5. Other Stapler-vs-normal differences: plan.periods length equals baseline periods length, subjectCategories are copied from the baseline day at creation ({} vs undefined in the fixture, same classification fallback), parity, verified and schoolDay are set by effectiveDay, workloadIgnored is set true by composeStaplerContext but does not change streak in eligibility, staplerRevision is a revision marker only. None of these change base, consecutiveBase, periodCount or runAt for an unchanged teacher. Venues does not use eligibility or workloadBase, so a fix to automatic streak does not change venues.

Conclusion, before any fix: fix automatic streak (and the solver violation check) to use consecutiveBase, not workloadBase, so automatic allocation trips on six consecutive occupied periods, including Don't-need-relief subjects. Keep maxConsecutivePeriods, consecutiveBase, consecutiveCountExclusions, daily workload total, and effectiveDay unchanged. This keeps allocation and venues consistent, because venues reads effectiveDay, which is unchanged, and allocation now counts the same occupied run for manual and automatic checks.

## Review

Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment

Not deployed. Staging and production separately: none.

## Handoff

Remaining work, blocker, next action, ownership transfer if any. No secrets or private school data.
