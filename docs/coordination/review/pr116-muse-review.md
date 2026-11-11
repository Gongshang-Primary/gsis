# Review: PR #116 — Apply Stapler values down a period with Undo

- Reviewer: Muse
- Reviewed head: `61aa82b9993a32caadd40fc9dedfdc37cc16c63b` (branch `codex/stapler-period-mass-apply`, base main)
- Verdict: **APPROVE**
- Date (Asia/Singapore): 2026-11-11 ~19:55
- Task: `docs/coordination/tasks/stapler-period-mass-apply.md` (owner, 11 Nov ~17:49, "cut queue inject", wanted by tonight in the next release)

## Evidence

- **CI run 43012982765** at the exact head: all 5 jobs green (full-suite + Regression shards 1/4, 2/4, 3/4, 4/4), verified via the check-runs API and the run record.
- **Local worktree wt116 at the exact head**: both new test files run with `TZ=Asia/Singapore NODE_NO_WARNINGS=1` and the Playwright chromium-1234 path — **both PASS**:
  - `tests/stapler-period-mass-apply.cjs` — PASS (period bulk apply: venue/group, blank no-op, recess/empty-cell isolation, canonical classes, custom/invalid classes, unchanged values, row compatibility).
  - `tests/stapler-period-mass-apply-browser.cjs` — PASS (Chromium period arrows in both views, optional fields, canonical class overwrite, counts, local-only apply, one-step Undo/Redo, custom-class Undo, read-only controls).
  - Codex reported the full local suite 1048/1048 Node + 40/40 LORD; not independently re-run by Muse — CI is the gate. (The count differs from #115's 1049 because this branch does not include #115; it branched from main at 522094e, before #115 merged.)
- **Negative control (reproduced by Muse)**: the new model test run against the base code (522094e) FAILS with exit 1, `Error: Choose a class.` (the old `bulkEdit` requires a classId). On the PR head it passes. The test proves the change.
- **Canonical build** in the worktree at the exact head: 18 components, `git status` clean — **no diff**.
- **Merge-tree** `git merge-tree --write-tree --name-only origin/main <head>`: conflicts ONLY in `CHANGELOG.md`, `notification-worker/dashboard-worker.mjs`, `notification-worker/dashboard-worker.txt`, `operations-worker/dashboard-worker.mjs`, `operations-worker/dashboard-worker.txt`. Handwritten source merges cleanly. These are exactly the CHANGELOG + generated-file conflicts the handover §3 local-merge procedure covers; they need resolution before merge (see below).
- **Allocation / relief / publication**: the #116-only diff (base 522094e to the head) touches only `shared/roster-stapler.js`, `roster-update/public/roster-stapler-ui.js` and the generated `roster-stapler-model.js` (52 insertions, 7 deletions). No allocation, relief, publication, notification or live-configuration logic changed.
- **Secret scan**: no secrets, tokens or private data in the diff.
- **Scope**: matches the task file as amended by the owner's ruling below. Product files are the Stapler model and UI plus the generated model copy; CHANGELOG, the task record, and the canonical generated bundles are in scope. The D1 parity guard passes with no catalog refresh.

## Owner ruling (recorded in the task file, supersedes the stop condition)

Codex investigated the duplicate-coverage case and reproduced it. The owner ruled: "take the latest action as canonical. user relies on undo function to undo." This supersedes the task's original duplicate-coverage stop condition. The implementation follows it: the selected class list replaces the class list on every targeted lesson tile, including when several teachers' tiles then cover the same class. Tiles are not merged or deleted. One local Undo entry restores the complete previous state, including any custom class created by the action. Blank fields still leave values unchanged. No remote save until Save to online.

## Findings (task file review notes, all checked)

1. **Apply touches only lesson tiles at the chosen period.** Model: `tiles=next.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid'&&command.periods.includes(t.period))`. UI: same filter with `t.period===n`. Recess tiles, Pit tiles, other periods and empty cells are untouched. The period is validated (`period(next,id)` fails on an invalid period).
2. **Blank field never clears a value.** Model: venue/group are only added to the patch when the text is non-empty; classIds only when the resolved id list is non-empty. The UI reports "Already matches" and makes no change (and no Undo entry) when nothing would change; the model also returns the plan unchanged in that case.
3. **classIds validated.** `selectedClasses` resolves the picked/custom classes; every id must be an existing class or the apply fails atomically with 'Choose valid classes.' before any tile is changed. Invalid IDs are rejected (covered by the model test).
4. **Changes stay local until Save.** The apply is one existing local `command(s,input)` (undoable, local-only). The browser test covers no remote save before Save to online, and the "Save to online" wording matches the row mass-write.
5. **Arrow absent when read-only.** `periodHeader` renders the ↓ button only when `s.data.canEdit`; it is disabled when `!editable(s)`, and `drawMeta`/`blockAccess` disable it too. The button appears in both the teacher thead and the class tfoot period row. The browser test covers read-only controls, and a Save-redraw regression (arrows disappearing after Save) was caught and fixed in this PR.
6. **Undo.** One command entry for the whole apply; one Undo restores all prior values and any newly created custom class. Covered by the browser test (one-step Undo/Redo, custom-class Undo).
7. **Row mass-write unchanged.** The existing `applyClassField` / Subject-Venue-Group row action is untouched (covered by the model test's row-compatibility case).

## Merge blocker (not a code finding)

The PR cannot merge as-is: main advanced (to 3d48bf3, the #115 merge) while this branch was being validated, so `CHANGELOG.md` and the four generated Worker bundle files conflict. Handwritten source merges cleanly. Resolution follows HANDOVER_REVIEWER.md §3 (local merge on origin/main: keep both CHANGELOG entries, take either side of the generated files, canonical build, run the PR's changed tests, push the merge commit). The reviewer performs that step on the owner's "merge 116" — it is not done in this review.

## What was not tested

- Live school data, Google/D1/provider endpoints, production deployment or live browser sessions. All test data is synthetic; no live writes or messages were sent. Historical comparisons excluded by the standard test runner are not claimed.

## Release notes for the owner

- Deploy files that change: Roster Pages (`roster-stapler-ui.js`, generated `roster-stapler-model.js`, generated `edge-roster-domain.js`), Notification Worker and Operations Worker bundles. The canonical build also regenerates the Google backends, but **Google remains frozen — no Google deployment**.
- The feature becomes available after the owner deploys the updated assets. It is wanted in tonight's release.
- Live verification after deploy: open a Stapler draft, click the ↓ at a period header in either view, set a venue/group/class, apply, confirm the column changes and that one Undo restores it; then Save to online.
