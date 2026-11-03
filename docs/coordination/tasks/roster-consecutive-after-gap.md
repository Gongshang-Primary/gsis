# roster-consecutive-after-gap: consecutive check ignores timetabled periods after a free period (bug)

- Status: implementing
- Owner/model: Muse
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-03
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

## Review

Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment

Not deployed. Staging and production separately: none.

## Handoff

Remaining work, blocker, next action, ownership transfer if any. No secrets or private school data.
