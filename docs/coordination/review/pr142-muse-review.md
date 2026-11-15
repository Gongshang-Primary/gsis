# Review: PR #142 — Stapler teacher-row Subject, Venue and Group write-across

- Reviewer/model: Muse
- Reviewed head: `dbd9fb432ba2a7fb6a485a2f94333f23b22d3818`
- PR: https://github.com/helper-gsps/gsis/pull/142 (draft, MERGEABLE, CLEAN)
- CI run: 43545762207, all 5 jobs pass at the exact head (4 regression shards + full-suite gate)
- Verdict: **APPROVED**

## Scope

Task record `docs/coordination/tasks/stapler-teacher-row-write-across.md` (on main as 3c2202c). The PR adds Subject / Venue / Group write-across fields with a "→" button to each teacher row in the Stapler planner teacher view, mirroring the class-row fields. Files changed (15): `roster-update/public/roster-stapler-ui.js`, `shared/roster-stapler.js`, 2 new tests, CHANGELOG.md, task record, and the regenerated bundles (Deploy_Backend, Roster_Backend, backend/Code.gs, both Worker bundles, edge-roster-domain.js, roster-stapler-model.js). No allocation, relief, publication, WhatsApp, live data, settings, merge or deploy changes.

## What the change does

- `teacherFields` (roster-stapler-ui.js) mirrors `classFields`: three forms (Subject 200, Venue 500, Group 300) with "→" buttons, `data-teacher-fields="<staffId>"`, rendered in the teacher view row header only when editable. `blockAccess` disables the teacher-field inputs/buttons too.
- `applyTeacherField` mirrors `applyClassField`: empty value refuses and focuses the input; otherwise the "Apply <label> to <teacher>" dialog offers the row choice (existing-only vs create) and, when create is chosen, a class picker (existing + custom) instead of a teacher picker. `bindBulkChoice` now also toggles the `[data-bulk-class]` section.
- New `bulkEdit` teacher branch (shared/roster-stapler.js): `teacherId` set, no `classId`, no `periods`. Validates the teacher exists ("Choose a teacher."), patch keys only subject/venue/group ("Only Subject, Venue and Group can be changed together."), applies to that teacher's lesson tiles, honouring an optional periods filter. Create path validates picked classes via `selectedClasses` (custom classes created the same way the tile edit form does).
- `bulkCreateTiles` teacher-row fill: rows = `[command.teacherId]`, periods = all periods, skipping periods the teacher already has a tile at. A recess span for a picked class is skipped (no tile created overlapping recess). The existing overlap checks stay: a teacher or class conflict rejects the WHOLE apply atomically with "No changes were applied."
- Typed values in the teacher fields survive re-renders (mirrors the class-row `classValues` restore in `drawTables`).
- The class-row write-across and the period mass-apply are unchanged (their tests pass).

## Local verification (worktree at the exact head, TZ=Asia/Singapore, NODE_NO_WARNINGS=1, Chromium = Playwright chromium-1234)

- New model test `tests/stapler-teacher-row-write-across.cjs`: PASS (teacher-row isolation, empty rows, matching values, validation, creation with custom classes, period filter, atomic conflict, recess-span skip).
- New browser test `tests/stapler-teacher-row-write-across-browser.cjs`: PASS (fields render with correct maxlengths, blank validation, changed/matched/empty messages, class picker visibility, local Undo, redraw retention, read-only view, no page errors, no saveStapler calls).
- Existing mass-apply tests PASS: `tests/stapler-period-mass-apply.cjs`, `tests/stapler-period-mass-apply-browser.cjs`, `tests/stapler-mass-apply-create-tiles.cjs`, `tests/stapler-period-subject.cjs`.
- Parity guard `tests/roster-d1-parity-guard.cjs`: PASS (273 entries, no catalog changes).
- Negative control reproduced: the new model test run in a worktree on main (3c2202c) FAILS with `Error: Choose a valid timetable period.` at the first teacher-row apply — main's `bulkEdit` has no teacher branch and treats the command as a column apply. The test passes on the PR head.
- Canonical build (`npm run build`) at the exact head: exit 0, no diff in the working tree.
- Merge tree (`git merge-tree --write-tree --name-only origin/main dbd9fb4`): clean, no conflicts.
- Secrets: no secret/token/password/key material in the diff.
- Full local suite was NOT re-run by the reviewer; the full suite is covered by the green exact-head CI run 43545762207 (and the PR body's 1097/1097 Node + 40/40 LORD claim is consistent with w's 1095 + 2 new tests).

## Findings

- None blocking. One cosmetic note: the task record's Implementation section still says "Full local suite is running" — superseded by the PR body's completed full-suite claim. No change required; the PR body is the current record.

## Release notes

Stapler teacher-row write-across: each teacher row in the Stapler planner teacher view now has Subject / Venue / Group fields with a "→" button that mass-writes one value across the whole row (all periods for that teacher), mirroring the class-row fields. Only existing lesson tiles change unless "In empty cells, create tiles" is chosen, in which case empty cells gain a tile for that teacher with the picked classes. Recess is never filled. Changes stay local until Save to online; one Undo restores the previous values and removes created tiles. Ships in the next release after w (not in w).
