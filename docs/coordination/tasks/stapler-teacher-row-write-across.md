# stapler-teacher-row-write-across: In Stapler, build the Subject / Venue / Group write-across fields for the teacher's row too

- Status: claimed (Codex, 14 November 2026)
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-14
- Branch: codex/stapler-teacher-row-write-across
- Base SHA: 47a6cefbbd92cdb0dad3e1138d640eba7234a28b (verify it is current main before branching)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- Owner request (14 Nov, screenshot of the live Stapler planner): the class rows have Subject / Venue / Group fields with a "→" button that mass-writes one value across the whole row. Build the same write-across fields for the teacher's row too.

## Problem
In the Stapler planner class view, each class row has Subject / Venue / Group fields with a "→" button (`classFields`, roster-stapler-ui.js:220) that mass-writes one value across the whole ROW (all periods for that class). The teacher view has no equivalent: a teacher's row header shows only the teacher's name, so to set the same venue, group or subject on every lesson a teacher teaches, the SMC must edit each tile one by one.

## Required behaviour
1. **Subject / Venue / Group fields with a "→" button on each teacher row**, in the teacher view's row header, mirroring `classFields` (roster-stapler-ui.js:220): three forms (Subject maxlength 200, Venue maxlength 500, Group maxlength 300), one input each plus a "→" submit button, `data-teacher-fields="<staffId>"`, aria-labels "Apply <label> to all <teacher> lesson tiles". Only when the plan is editable (`s.data.canEdit`); disabled otherwise, matching the class-row fields.
2. **Clicking "→" with a value opens the same "Apply <label> to <teacher>" dialog as the class row** (`applyClassField`, roster-stapler-ui.js:488): the row choice `bulkChoice('row', …)` — "(a) Only write values to cells with tiles" or "(b) In empty cells, create tiles to fill whole row". When "create" is chosen, show a class picker (existing classes plus custom class, reusing `classPicker` and `customClasses`) instead of a teacher picker — the row teacher is the tile's teacher, so no teacher picker is needed. An empty value refuses with "Enter <label> before applying it to <teacher>." and focuses the input, as the class row does.
3. **Apply writes the value to all lesson tiles for that teacher** (the whole row, all periods). Add a teacher branch to `bulkEdit` (`shared/roster-stapler.js:209`, mirroring the classId row branch): `command.teacherId` set, no `classId`, no `periods`. Validate the teacher exists in the plan (`next.teachers`, else fail "Choose a teacher."); patch keys only `subject`, `venue`, `group` (else fail "Only Subject, Venue and Group can be changed together."); apply to lesson tiles with `t.teacherId === command.teacherId` (honouring an optional `periods` filter, as the class branch does).
4. **Only existing lesson tiles are changed unless "create" is chosen.** Recess tiles are untouched. Empty cells (no tile for that teacher at that period) are left empty — no tile is created — unless "create" is chosen, in which case empty cells gain a tile for that teacher with the picked classes (possibly none, exactly as the teacher-view period-column create does today) and the applied value. Extend `bulkCreateTiles` (`shared/roster-stapler.js:36`) so a teacher-row command (`teacherId` set, `view:'teacher'`, no `classId`, no `periods`) fills only that teacher's row: rows = `[command.teacherId]`, periods = all periods, skipping periods the teacher already has a tile at. The existing overlap checks stay: a teacher who already has a lesson at that period, or a class already covered at that period, rejects the WHOLE apply atomically with "No changes were applied." and no partial changes.
5. **Changes stay local until Save to online**, exactly like the class-row write-across. After applying, tell the SMC how many lesson tiles were changed, how many already matched, and how many tiles were created, as `applyBulk` does. One Undo restores the previous values and removes created tiles.
6. **Typed values in the teacher fields survive re-renders**, mirroring the class-row restore in `drawTables` (roster-stapler-ui.js:269,278): preserve the values in `[data-teacher-fields]` across redraws and wire each form's submit to the teacher apply handler.
7. **Nothing else changes.** No allocation, no relief, no publication, no WhatsApp. The plan's teachers, classes, periods and recess blocks are untouched. The class-row write-across (`classFields` / `applyClassField`) and the period mass-apply (`applyPeriod`) are unchanged. The teacher on a tile is never changed by this feature — the row teacher is fixed.

## Owner rulings carried forward
- 11 Nov (period mass-apply): "take the latest action as canonical. user relies on undo function to undo." — the applied value replaces the field on every targeted tile, even when that creates duplicate coverage; one Undo restores it.
- 12 Nov (#123): a single teacher picked for a class-column creation with several empty cells at the same period is a teacher conflict, so that apply rejects atomically. The mirror here is the `bulkCreateTiles` overlap check in rule 4.

## Files/domains owned (include generated outputs)
- roster-update/public/roster-stapler-ui.js (teacher-row fields, apply dialog with class picker, state restore).
- shared/roster-stapler.js (`bulkEdit` teacher branch, `bulkCreateTiles` teacher-row fill).
- Tests, CHANGELOG.md, generated bundles via the canonical build.

## Out of scope
- Changing the teacher on a tile; moving or deleting tiles; changing recess; allocation; relief; publication; any live data, settings, merge or deploy.
- If the task needs files outside the scope above, STOP and report it as a scope request first. Do not silently expand scope.

## CHANGELOG entry (inject in the PR, at the top of CHANGELOG.md)

Stapler teacher-row write-across, 14 November 2026

Model: Codex. In the Stapler planner teacher view, each teacher row has Subject / Venue / Group fields with a "→" button that mass-writes one value across the whole row (all periods for that teacher), mirroring the class-row fields. Only existing lesson tiles change unless "In empty cells, create tiles" is chosen, in which case empty cells gain a tile for that teacher with the picked classes. Recess is never filled. Changes stay local until Save to online; one Undo restores the previous values and removes created tiles. See docs/coordination/tasks/stapler-teacher-row-write-across.md.

## Acceptance checks
1. Test: applying a venue to a teacher's row changes the venue on every lesson tile for that teacher and no tile for any other teacher (fails on current code — there is no teacher-row bulk path).
2. Test: applying a subject/venue/group to a teacher with no lesson tiles reports "There are no existing lesson tiles to update." and changes nothing (unless "create" is chosen).
3. Test: with "create" chosen, empty cells in the teacher's row gain a tile for that teacher with the picked classes and the applied value; cells the teacher already has a tile at are updated, not duplicated; recess is untouched.
4. Test: a teacher/class conflict on creation (the picked class already has a lesson at that period with another teacher) rejects the whole apply atomically, with no partial changes and the old plan unchanged.
5. Test: an unknown teacher id fails; a patch key outside subject/venue/group fails; the old plan is unchanged after a failed apply (Undo available).
6. Test: applying a value every tile already has reports "already matches" and changes nothing.
7. Browser test: the Subject / Venue / Group fields with "→" buttons appear on each teacher row when editable and are absent/disabled when the plan is read-only; typing a value and clicking "→" opens the dialog, and applying shows the changed count; the create choice shows the class picker.
8. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Review notes for Muse (reviewer)
- Review at the exact head with HANDOVER_REVIEWER.md §2.
- Check especially: the apply touches only lesson tiles for that teacher (no other teacher, no recess, no empty-cell creation unless "create" was chosen); the created tiles carry the row teacher and the picked classes; a conflict rejects atomically with no partial changes; typed field values survive redraws; changes stay local until Save; allocation/relief/publication untouched; the fields are absent when read-only; the class-row fields and period mass-apply are unchanged.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the feature works only after the owner redeploys with this fix.

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- Do not change live data, settings, or release branches.
