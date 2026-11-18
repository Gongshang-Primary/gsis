# Muse review — PR #209: export v1 Roster Excel from the selected local working copy

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #209, branch `codex/v1-roster-offline-export`, OPEN, MERGEABLE.
- Exact head reviewed: `b33a42adf1852bcd8bb640ac2a1d4dda46f30451`.
- Base (claimed implementation base): `8c2ece8f6cabdb1956b4775c01a1364fd898a2ed` (merge-base of the head against current origin/main `aa4aba3c`, which is the #207 review record on top of `badd6b31`).
- Verdict: **APPROVED at the exact head.**

## What it fixes

All three Assign Relief Excel actions (daily, relief, class) now export from the selected date's local working copy — including unsaved assignments — with no network request, no timetable fetch, no save and no publication. Previously the export path demanded an online refresh and rejected the export when the allocation revision had advanced past the cached plan.

## Scope verified

- Diff is exactly the four paths in the task record `docs/coordination/tasks/v1-roster-offline-export.md`: the task record, `scripts/v1/build-web.mjs`, `tests/v1-product-roster-offline-export-browser.mjs`, `v1/web/shared/roster-local-export.js`. 742 insertions, 2 deletions.
- `git merge-tree --write-tree --name-only origin/main b33a42a` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- Roster web assets only. No Worker, workbook renderer, D1 data model, dependency, schema, permission or deployment change. No migration. No live data change.

## Design read

- New module `v1/web/shared/roster-local-export.js` exposes `window.GSISRosterLocalExport.context(date, view, nameFor, readCachedPlan)`. It validates the local day before building anything: timetable identity and date, school-day and verified flags, allocation model with an assignments array, demands all belonging to the date, an absences array, periods with integer period and finite start/end minutes, every demanded period present in the timetable, and a non-empty teacher list with staff IDs and names. Each failure throws a precise error naming the missing datum (date, teacher, period).
- Plan resolution, in order: (1) the loaded export context's saved plan, accepted only when date, parity and periods match exactly, the Stapler revision or baseline ID matches, every day teacher is in the plan, and `GSISRosterStapler.validate(plan)` passes — the allocation revision is deliberately NOT required to match, so a newer local draft still exports; (2) on a confirmed Stapler day, the cached confirmed plan via `readCachedPlan()`, which must match the same way, or the export refuses with the exact missing confirmed-plan revision — teacher cells alone cannot substitute, because recess and baseline-to-plan changes are not recoverable from them; (3) otherwise rebuild from complete local baseline cells, throwing the exact missing `P<period>` for a teacher when a cell is not a four-string array.
- The returned context is a structured clone: date, revision, allocationRevision, periods, rows (Stapler change rows plus absence rows), workloadEvidence, timetableSource, legend, and teacherSummary (plan, absences, demands, addedTeachers, staplerStatus). Current local absences, demands and assignments drive the workbook; worksheet formatting and existing privacy rules are preserved (the test asserts private reason/instruction strings never appear).
- `scripts/v1/build-web.mjs` adds `updateRosterLocalExport`, a build-time adapter on the copied v0.9 Roster editor: it replaces the online-refresh-gated export-context construction with a call to the new local helper, handling both the original v0.9 source and the independently repaired variant from PR #182 (detected by the presence of the repaired string, so the adapter does not break if #182's repair lands first); it appends "· Estimated workload" to the snapshot label on every workbook when workload evidence is estimated; and it replaces the on-demand timetable fetch with the already-available cached timetable, so export never starts a timetable request. The new script is wired into the Roster page head. The adapter's `replaceOnce` anchors fail the build if the copied source drifts, rather than silently producing a different editor.

## CI verified at the exact head

- Node/LORD run 44218857412: head_sha verified `b33a42a`, completed success, all five jobs green.
- Product run 44220467325 (checks page): head_sha verified `b33a42a`, completed success. Product run 44218856669 (linked in the PR body) also verified success at the exact head.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-roster-offline-export-browser.mjs` — PASS (6/6 groups: three real XLSX files contain the unsaved selected-day edit despite a context revision mismatch, with zero export requests; absent export context rebuilds from complete loaded cells; date change rejects the wrong-date cached plan without leaking the other draft; incomplete current cells are refused with the exact date/teacher/period message and no file, request or write; synthetic confirmed-plan cache preserves moved lessons, change rows and class recess in three button-generated XLSX Blobs; a missing confirmed-plan revision refuses all three files without fetching or writing).
- `node tests/v1-product-roster-estimated-browser.mjs` — PASS.
- `node tests/v1-product-roster-workload-browser.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): the new browser test failed on the original revision check at `fd6b111` and passed with the fix. The passing state is re-verified locally above.
- N2 (fixture limitation, disclosed in the task record): in the synthetic confirmed-plan group only, the final download-anchor handoff is intercepted and the three XLSX Blobs are parsed directly, because locked Chromium intermittently missed a download event after ten files despite UI success. The three real buttons are still clicked and the Blobs are the actual generated workbooks; the first three groups use nine real downloads. This does not weaken the export-content assertions, but the confirmation write path is explicitly not exercised by that group.
- N3 (overlap, not blocking): the task record states #205 and the Deploy TTb branch have disjoint files, and the department branch's separate `build-web.mjs` Deploy hunk does not touch the Roster integration. The #207 merge (TTb, head 559a760) is not yet merged; this branch's base predates it, but the two touch disjoint files (Deploy vs Roster), so no integration conflict is expected. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner request recorded (export the selected day's local timetable and allocations, including unsaved edits, from all three actions); exact scope in the task record.
- Q02: Pass. Local projection only; no new data source, authority or access path.
- Q03: Pass. Existing signature/ownership checks untouched; export is read-only by construction (zero requests, zero D1 writes asserted).
- Q04: Pass. No save or publication is started; read-only refusal paths assert no writes.
- Q05: Pass. Bounded Roster web-asset route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green (two runs).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a code rollback of the adapter and helper; no stored data migration is required. Previously exported files are unchanged.
