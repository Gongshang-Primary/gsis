# Review of PR #124 — Add Subject to Stapler period mass-apply

- Reviewer/model: Muse
- Reviewed head: `196cac2facc0216bd273cc57d88b7e76c847db72`
- Base: `c7590be14d027c3da3aec5f0f4aed9d4c5c2d7fb`
- Date (Asia/Singapore): 2026-11-12
- Verdict: **APPROVE**

## What the PR does

The period mass-apply overlay ("Apply values to P<n>") now offers an optional Subject input beside Venue and Group, with a datalist of existing lesson-tile subjects and the same 500-character limit. A filled Subject updates every lesson tile at the period and is carried into newly created column tiles (create mode). A blank Subject preserves existing subjects and leaves created subjects blank. The `bulkEdit` column branch now allows and extracts `subject`, and the "already matches" check includes it, so a Subject-only apply that already matches changes nothing and makes no Undo entry. This supersedes the #116 out-of-scope note that excluded Subject from the overlay. The (a)/(b) choice, teacher picker, class picker, one-Undo rule, atomic conflict rejection, recess handling and Save-to-online behaviour are unchanged, as is the class-row mass-write (which already had Subject).

## Evidence

- **CI run 43186954070 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks`.
- **Local worktree at the exact head, all 4 changed/new tests PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path):
  - `tests/stapler-period-subject.cjs` (new): PASS — optional period Subject: existing-only isolation, blank/matching values, length validation, both creation views and atomic conflicts.
  - `tests/stapler-period-mass-apply.cjs` (changed): PASS — period bulk apply: venue/group, blank no-op, recess/empty-cell isolation, canonical classes, custom/invalid classes, unchanged values and row compatibility.
  - `tests/stapler-period-mass-apply-browser.cjs` (changed): PASS — Chromium period arrows in both views, optional fields, canonical class overwrite, counts, local-only apply, one-step Undo/Redo, custom-class Undo and read-only controls.
  - `tests/stapler-mass-apply-create-tiles-browser.cjs` (changed): PASS — Chromium per-use choices, teacher pickers, all three creation modes, atomic conflict, recess skip, local-only writes and one-step Undo/Redo.
- **Negative control reproduced**: the new model test on base c7590be FAILS, exit 1, `Error: Only Venue, Group and Class can be changed by period.` (status 400) — Subject is rejected without the change.
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `npm run build`).
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main 196cac2` reports no conflicts.
- **D1 parity guard**: `node tests/roster-d1-parity.mjs` exit 0, 272 operations, unchanged.
- **Secret scan**: no password/secret/token/key matches in the hand-written diffs.
- **Scope matches the task record** (`docs/coordination/tasks/stapler-period-mass-apply-subject.md`): hand-written changes are only `shared/roster-stapler.js` and `roster-update/public/roster-stapler-ui.js`, plus tests, CHANGELOG and the task record; the rest are canonical generated bundles. No allocation, relief, publication, WhatsApp, live data, settings or release-branch changes. Release t untouched.

## Findings

- **Subject datalist is lesson-only**: the `values(key)` helper now filters to `t.kind==='lesson'` for the subject datalist, so suggestions come from lesson tiles only. Correct.
- **Created tiles use the dialog's Subject**: `bulkCreateTiles` now sets `subject:values.subject||''` for both row and column cases (previously the column case was hard-coded to `''`). Blank stays blank. Correct.
- **Blank Subject never clears a value**: the values loop only adds a key when the text is non-empty, so a blank Subject is absent from `values` and neither existing tiles nor created tiles are affected by it. Correct.
- No findings against approval.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the four changed/new tests plus the parity guard and canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Ships in the next release after v0.9.9t. Deploy updated Roster Pages `roster-stapler-ui.js`, generated `roster-stapler-model.js` and generated `edge-roster-domain.js`, along with the canonical Notification/Operations Worker bundles containing the shared model. Google stays frozen. Refresh an open planner after deployment.
