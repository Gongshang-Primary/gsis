# stapler-mass-apply-create-tiles: Whole row / whole column mass-apply offers "only write to cells with tiles" or "create tiles in empty cells"

- Status: proposed
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-12 15:14
- Branch: codex/stapler-mass-apply-create-tiles
- Base SHA: 6c71e7a6641393540233b3b402acdf081b8c0c47 (current main, verified before branching)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: Add a fill choice to both Stapler mass-apply functions (the class-row Subject/Venue/Group mass-write and the period-header down-arrow mass-apply). Urgent owner injection, 12 Nov 15:14 SGT, for immediate release. This jumps the Codex queue (Venues secret consolidation held). Ships in the next release after v0.9.9t (release t is already built and verified; do not rebuild it).
- Owner ruling (12 Nov, verbatim in substance): "on use of the whole row / whole column functions, include a choice that asks user 'only write values to cells with tiles' or 'in empty cells, create tiles to fill whole (row/column)'"

## Problem
The Stapler mass-apply functions only write to cells that already have a lesson tile. The class-row Subject/Venue/Group mass-write (`applyClassField`, roster-stapler-ui.js:474) and the period-header down-arrow mass-apply (`applyPeriod`, roster-stapler-ui.js:459, via `bulkEdit` in shared/roster-stapler.js:190) both leave empty cells empty. For a mass assembly (every class in the Hall at P2, same group), the SMC wants the option to create tiles in the empty cells so the whole row or column is filled, instead of only updating the cells that already have tiles.

## Required behaviour
1. **A choice is asked on every use of both functions**, before anything is written:
   - (a) "Only write values to cells with tiles" — the current behaviour. Only existing lesson tiles change; empty cells stay empty.
   - (b) "In empty cells, create tiles to fill whole (row/column)" — as well as writing the values to existing tiles, create one lesson tile in each empty cell of the row (class-row function) or column (period function), so the whole row/column is filled.
   - The choice is presented in the period overlay dialog (as a fieldset/radio choice) and, for the row mass-write, in a small confirm dialog shown when the "→" button is clicked (the row function has no dialog today; do not apply on click before the choice is made). The default is (a). The choice is remembered only for that one apply, not persisted.
2. **Created tiles follow the row and the dialog.** A created tile takes the values being applied (Venue/Group/Class for the period function; the one Subject/Venue/Group value for the row function) and its identity from the row and the dialog:
   - Period function, teacher view: teacherId is the row's teacher; classIds are the dialog's chosen class(es); subject is blank.
   - Period function, class view: classIds are the row's class; the teacher must be chosen in the dialog — add a teacher picker (reusing the tile edit form's teacher picker) that appears only when (b) is selected, and require a teacher before applying with creation.
   - Class-row function: classIds are the row's class; the applied Subject/Venue/Group value is set and the other two fields are blank; the teacher must be chosen in the choice dialog (same teacher picker), required before applying with creation.
   - A lesson tile must have a teacherId in the plan's teacher set (`shared/roster-stapler.js:137` fails otherwise), so a created tile without a valid teacher is never written.
3. **Recess is never touched and never created.** A cell covered by a recess block is not an empty cell for this purpose: no tile is created in it, and no recess tile is changed. A tile whose period is spanned by a multi-period lesson is changed once (by its start period); a multi-period lesson does not create a second tile in a spanned cell.
4. **The whole apply is one local command/Undo entry**, exactly like the existing mass-apply (one Undo restores every changed tile and removes every created tile). Changes stay local until Save to online. After applying, tell the SMC how many lesson tiles were changed and how many tiles were created (and how many were already matching, if any).
5. **Nothing else changes.** No allocation, no relief, no publication, no WhatsApp. The plan's teachers, classes, periods and recess blocks are untouched. The existing #116 owner ruling still applies to the (a) path: the latest class selection is canonical and one Undo restores it.

## Files/domains owned (include generated outputs)
- roster-update/public/roster-stapler-ui.js (choice in the period overlay dialog and the row mass-write confirm dialog, teacher picker, apply handlers).
- shared/roster-stapler.js (`bulkEdit` — create-tiles option; reuse the `addTile` tile-creation path and `selectedClasses` validation).
- Tests, CHANGELOG.md, generated bundles via the canonical build.

## Out of scope
- Changing what the (a) path does (it stays exactly as #116 built it); moving or deleting tiles; changing recess; allocation; relief; publication; any live data, settings, merge or deploy.
- If creating tiles in an empty cell would violate a plan rule (teacher already has a lesson at that period, class already covered at that period), the whole apply fails without changing anything and reports the conflict, instead of creating a partial fill. Do not create a tile that fails validation.
- Do not rebuild release t or touch any release branch.

## Acceptance checks
1. Test: period apply with (a) changes only existing tiles at the period and creates none (fails on current code if the choice is missing).
2. Test: period apply with (b) in the teacher view creates one tile per empty cell at the period with the row teacher, dialog class(es), venue and group, and changes the existing tiles.
3. Test: period apply with (b) in the class view requires a teacher; with a teacher chosen it creates one tile per empty cell at the period with the row class and that teacher.
4. Test: row mass-write with (b) creates one tile per empty cell in the class row with the row class, the applied value, and the chosen teacher.
5. Test: recess cells are never filled and recess tiles are never changed by either function with (b).
6. Test: a teacher or class conflict in an empty cell rejects the whole apply with no change (no partial fill).
7. Test: one Undo restores the whole apply, including removing every created tile.
8. Browser test: the choice appears in the period overlay and on row "→" click; (a) is the default; (b) shows the teacher picker where the teacher is not determined by the row; applying reports changed and created counts.
9. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Review notes for Muse (reviewer)
- Review at the exact head with HANDOVER_REVIEWER.md §2.
- Check especially: the choice is asked before any write in both functions; (a) behaves exactly as #116; created tiles always have a valid teacherId and valid classIds; recess is never filled or changed; a conflict rejects the whole apply with no partial fill; one Undo removes every created tile; changes stay local until Save; allocation/relief/publication untouched.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the feature works only after the owner redeploys with this fix, and it is wanted in the next release after t.

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- Do not change live data, settings, or release branches.

- Claim: Model: Codex, 12 November 2026. Owner-authorized urgent injection, jumps the Codex queue. Branch created from current main. Muse reviews the exact implementation head. No live operations or changes to release branches are authorized.
