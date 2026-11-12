# Review of PR #123 — Fill empty Stapler cells through mass-apply

- Reviewer/model: Muse
- Reviewed head: `e506e81f126291a1bfce22f6722467bd447727f2`
- Base: `937da37f898e94998b77f5a62aee6e8ffac2ad8b`
- Date (Asia/Singapore): 2026-11-12
- Verdict: **APPROVE**

## What the PR does

Both Stapler mass-apply functions now ask, before any write, whether to update existing lesson tiles only (default) or also create lesson tiles in empty cells to fill the whole row/column. The class-row Subject/Venue/Group "→" opens a confirm dialog with the choice; the period-header "↓" overlay includes the same choice as a radio fieldset. The choice is per-use and never persisted.

Creation follows the view identity: teacher-view period columns use each row's teacher and the dialog's chosen class(es) with blank subject; class-view period columns and class rows require an explicit teacher (teacher picker shown only when "create" is selected). Created tiles reuse `addTile`'s lesson-construction helper (extracted as `addLessonTile`), so they carry original-card source details and unique IDs. The whole apply is prepared on a cloned plan and uses one existing local command-history entry; one Undo restores changed values and removes every created tile. Nothing saves online until Save to online. Result text reports changed, created and already-matching counts.

## Evidence

- **CI run 43177308149 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks`.
- **Local worktree at the exact head, all 3 changed/new tests PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path):
  - `tests/stapler-mass-apply-create-tiles.cjs` (new): PASS — whole-row/column creation, default no-create, identity, recess spans, validation, atomic conflicts.
  - `tests/stapler-mass-apply-create-tiles-browser.cjs` (new): PASS — Chromium per-use choices, teacher pickers, all three creation modes, atomic conflict, recess skip, local-only writes, one-step Undo/Redo.
  - `tests/release083-class-field-arrows.cjs` (changed): PASS — independent class arrows, local-only one-step undo, baseline/recess integrity, read-only controls.
- **Negative control reproduced**: the new model test on base 937da37 FAILS, exit 1, `AssertionError: one new lesson for each empty teacher row / 0 !== 2` (zero created tiles without the change).
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `npm run build`).
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main e506e81` reports no conflicts.
- **D1 parity guard**: `node tests/roster-d1-parity.mjs` exit 0, 272 operations, unchanged.
- **Secret scan**: no password/secret/token/key matches in the hand-written diffs.
- **Scope matches the task record** (`docs/coordination/tasks/stapler-mass-apply-create-tiles.md`): hand-written changes are only `shared/roster-stapler.js` and `roster-update/public/roster-stapler-ui.js`, plus tests, CHANGELOG and the task record; the rest are canonical generated bundles. No allocation, relief, publication, WhatsApp, live data, settings or release-branch changes. Release t untouched (no release branch or label changed).

## Findings

- **Atomic conflict rejection is correct and matches the task's hard rule.** A single teacher picked for a class-column creation with several empty cells at the same period is a teacher conflict under the plan's own rules, so the whole apply rejects with no partial fill rather than creating the first tile and failing on the second. The same holds for assigning already-covered classes to newly created teacher-column tiles. This is the specified behaviour, not a defect. The owner should know: for a mass assembly where one teacher supervises several classes at the same period, the plan's teacher-conflict rule means that apply is rejected; each class needs its own teacher (or the tiles must already exist).
- **Recess handling verified in code**: `active(plan)` returns all grid tiles including recess, so `bulkCreateTiles` skips any cell spanned by an existing tile (including recess) and its overlap check also rejects a created tile that would overlap a recess tile for the same class.
- **Created tiles always carry a valid teacherId**: the model requires a teacher in the plan's teacher set (`shared/roster-stapler.js:137`), and the UI requires a teacher choice before applying with creation where the row does not determine one. The (a) path is unchanged from #116.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the three changed/new tests plus the parity guard and canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Ships in the next release after v0.9.9t. Deploy updated Roster Pages `roster-stapler-ui.js`, generated `roster-stapler-model.js` and generated `edge-roster-domain.js`, along with the canonical Notification/Operations Worker bundles containing the shared model. Google stays frozen. Refresh an open planner after deployment.
