# Review of PR #48 — Deploy/Roster: use confirmed timetabled occupancy wording

- Reviewer/model: Muse
- Reviewed head: `98283d6fa364389c01716eea463eb3b403844aa9`
- Base: main `78f6a214781b66fbaf889b8f2958993bcddd19c6` (rebase base recorded in the PR body)
- Date (Asia/Singapore): 2026-11-13
- Verdict: **APPROVE**

## What the PR does

Applies the owner-confirmed wording mapping to Deploy and Roster calculations, statistics, help, tooltips and Excel headers: "weekly workload estimate (Wi)" → "weekly individual occupancy (timetabled plus allowances)", "recorded work" → "recorded (timetabled) occupancy", "Workload reference" → "Occupancy reference", "Actual load" → "Actual (timetabled) occupancy", "Individual load status" → "Individual (timetabled) occupancy status", "weekly quota / quota" → "weekly relief quota, R / relief quota". Visible text only. Budgets, formulas, policy identifiers and persisted data fields are unchanged, as are the "Workload settings" tab and policy names.

## Evidence

- **CI run 43321303017 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks` and `gh run view`: headSha `98283d6fa364389c01716eea463eb3b403844aa9`, conclusion success, event push. All five jobs show run_attempt 2: the initial attempt failed shard 1 on the unchanged LORD keyboard-space test (`P lease...` instead of `Please...`); the failed-job retry passed at the same head. No LORD source or test edits in this PR.
- **Local worktree at the exact head, all 8 programs PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path):
  - `tests/release04-ui.cjs` (changed): PASS — grouped navigation, teacher search, orange multiples, unassigned pane, optional roles, duty editing/removal/conflicts, summary and one-request save.
  - `tests/release18-summary.cjs` (changed): PASS — total periods arithmetic and ordering in both modes; Summary single scroller, sticky header and viewport constraint.
  - `tests/release603-ledger.cjs` (changed): PASS — Ledger full-time denominator, non-teaching actuals, FAJT, RT, part-time stacking, unavailable inputs, unchanged cap, rendered LaTeX, adjacent values and export.
  - `tests/roster716-calculations-browser.cjs` (changed): PASS — Chromium Calculations browser: all-role learning tile, retired header, lazy load, actual personal figures, expandable explanation, desktop/mobile.
  - `tests/workload414-ui.cjs` (changed): PASS — Workload headcount includes FAJT, independent status cells, partial/status filtering, no-results, sort/rerender retention, filtered export, dividers and unit-only venue display.
  - `tests/roster088-statistics-contrast.cjs`: PASS — Statistics header/filter contrast pairs exceed 4.5:1.
  - `tests/release087-composition.cjs`: PASS — Roster composition preserves retained domain/venue helpers and rejects Layout/Deploy routes.
  - `lord-suite/tests/booking-remarks-return-browser.cjs`: PASS — space keyboard entry and cursor, repeated spaces, draft redraw and reload, save and reopen, three equal return actions at four viewport sizes, explicit issue/clean submissions, mismatch cannot become clean return.
- **Negative control reproduced**: no new test file exists in this PR (wording-only change), so the two changed tests with wording assertions were copied into a temp worktree on origin/main (`78f6a21`) and run there. Both FAIL, exit 1, `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` — the updated assertions detect the old wording. `tests/workload414-ui.cjs` and `tests/release603-ledger.cjs` both fail on main and pass at the reviewed head.
- **Canonical build at the head: 18 components, no diff** (`TZ=Asia/Singapore npm run build` exit 0; `git status` clean afterwards).
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main 98283d6fa364389c01716eea463eb3b403844aa9` reports no conflicts (single tree hash only).
- **Scope matches the task record** (`docs/coordination/tasks/wording-timetabled-occupancy.md`): 12 files changed, 57 insertions, 37 deletions. Hand-written product changes are only string literals in `public/relief-ui.js`, `public/workload-ui.js`, `roster-update/public/roster-calculations.js` and `roster-update/public/roster-operations-ui.js`; `public/app.js` is the generated copy of the same wording (20 +/- lines, all wording). Test changes are assertion updates to the new headers, aria-labels and expected text. CHANGELOG and the task record are the only other files. No formula, budget, cap, policy identifier, data field, export column key or API name changes found in the diff (verified line by line, including a character-level diff of the two long roster-calculations/operations-ui lines). Excel headers are the same table headers asserted by the workload414/release603 tests, and both pass.
- **Secret scan**: no password/secret/token/key matches in the diff.
- **Rebase**: the PR body records the original head `ee8cadb` and the sole conflict (CHANGELOG.md, both entries retained). The rebased head is what was reviewed here; earlier approvals do not carry.

## Findings

- **Wording matches the owner-confirmed mapping exactly**: every changed string follows the 1 Nov mapping in the task record (including "weekly relief quota, R" and "recorded (timetabled) occupancy"). Correct.
- **Policy/settings names untouched**: "Workload settings", weekly caps and workload-category wording are unchanged, per the boundary. Correct.
- **"R quota" → "relief quota" in the Relief Health hint** ("Opportunities across periods are not separate relief quota"): consistent with the mapping. Correct.
- No findings against approval.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the eight affected/compatibility programs above plus the canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Ships in the next release after v0.9.9v. Deploy updated Deploy Pages (`workload-ui.js`, `relief-ui.js`, generated `app.js`) and Roster Pages (`roster-calculations.js`, `roster-operations-ui.js`). Google stays frozen. No settings, flags or data changes. Refresh open Deploy/Roster pages after deployment to see the new wording.
