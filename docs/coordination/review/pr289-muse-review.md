# Review: PR #289 — Open Deploy Workload Settings in compact view (Muse, exact head 710414ee)

Project: v1. Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `710414eebf0f150a4e22e49243ae65264d689434`.**

## PR

- #289, `codex/v1-deploy-workload-settings-view`, "Model: Codex / Open Deploy Workload Settings in compact view". Reviewer named: Muse at exact head `710414ee`. Merger: GPT.
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base `e3eb8a9` (the #262 review record commit); merge-base `2f59e358` (the task claim commit).
- Implements DEP-23-004 from the #287 UAT log: Workload Settings opens as a compact view with an explicit Edit button; Cancel and Apply return to the view. Investigates DEP-23-005 (IMP display per version).

## CI at the exact head

- "Isolated v1 product", run 45109163412, head `710414ee`, event pull_request, completed **success** (34m36s). The PR body states the full suite passed; the new browser test's five groups are verified locally below.
- "Verify GSiS queue changes", run 45109133836, head `710414ee`, completed **success**: full-suite pass, scope pass, regression shards skipping (v1-only change under the #280 scope rule). No waiver needed: this is a `codex/**` branch, so Node/LORD CI ran.

## Scope

Diff against the merge-base (`2f59e358`): **5 files, 517 insertions, 12 deletions.** The file list matches the task record's exact scope.

| File | Change |
| --- | --- |
| `docs/coordination/tasks/v1-deploy-workload-settings-view.md` | +27/−3: implementation and verification sections |
| `v1/web/shared/deploy-workload-settings-ui.js` | +85, new: view-first wrapper around the existing editor |
| `v1/web/shared/deploy-ui-tables.js` | +17/−1: import the view installer; register the subjects table by selector |
| `tests/v1-product-deploy-workload-settings-browser.mjs` | +378, new: five-group browser test |
| `tests/v1-product-table-deploy-settings.mjs` | +10/−8: serve the new module in the intercepted-origin fixtures; adapter selected by table selector |

- `git merge-tree --write-tree --name-only origin/main 710414ee` returns a clean tree (`c8be87aa…`). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret values.

## Change, read (not trusted)

- The new module wraps `window.workloadSettings`: on arrival it renders a compact panel (Edit button only when `deploy.edit` is capable; countable-activities table or the empty state; subjects table from the Workload workbook rows) instead of opening the editor. Edit invokes the existing form with `returnTab` set so Cancel/Apply return to the view; Apply queues the validated change and the existing Save to online control commits it. All displayed values pass through `esc()`; the activity list comes from validated `GSISWorkload.nonTeachingActivities(doc)`. The module has no imports of its own.
- The import is placed in `deploy-ui-tables.js`, not `deploy-ui.js` — the #285 lesson is applied here: the table test's intercepted-origin module map was extended to serve the new module, so the standalone harness does not abort on it. Product CI passing confirms the tables tests still pass.
- The subjects table is registered for workbook export by its `data-workload-settings-subjects` selector; the view's Import button is disabled (the editor's import preview stays available after Edit).
- DEP-23-005 is handled as version-scoped display: the view shows the selected version's saved activities or the empty state; it does not author activity data.

## Local verification at the exact head

Worktree `~/workspace/gsis-work/review/wt289-review` at `710414ee`. TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM = Playwright chromium-1234.

- `npm ci` (root): exit 0. `npm ci --prefix v1`: exit 0.
- `node tests/v1-product-deploy-workload-settings-browser.mjs`: exit 0 — **5/5 groups pass** (arrival in clean compact view with version-owned IMP and disabled view import; visible-report Excel export without a mutation; explicit Edit retains workbook preview and Cancel returns unchanged; Apply queues and native Save/reload persists the category with IMP and No FTT intact; version switching scopes IMP/empty states, re-entry is view-only, denied user gets 403).
- `node tests/v1-product-table-deploy-settings.mjs`: exit 0.
- `node tests/v1-product-deploy-compact-refresh-browser.mjs`: exit 0.
- `node tests/v1-product-deploy-planning-save-controls-browser.mjs`: exit 0.
- `node tests/imp-nonteaching-ui.cjs`: exit 0.
- `npm run build`: exit 0. `git diff --exit-code`: zero tracked drift.
- `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0. The built output (`deliverables/v1/product/web/assets/v1/shared/`) contains the new `deploy-workload-settings-ui.js` alongside `deploy-ui-tables.js`.
- The task record's claim commits check out: `2f59e358` is the claim commit (and this diff's merge-base); `fad70c08` is the workbook-fixture scope update on main.

## Findings

None.

## Quality gates

- Q01 (scope): five files inside the task record's stated scope. Pass.
- Q02: the view-first change is display behaviour plus an Edit gate; no save, validation, capability or workbook contract changes. The test asserts the queue, save and denial paths unchanged. Pass.
- Q03: the new test covers arrival, export, Edit/Cancel, Apply/save/reload, version switching and the denied user. Pass.
- Q04: no deployment, migration or live-data effect. Not applicable.
- Q05: product CI green at the exact head (run 45109163412); queue CI green (run 45109133836). Pass.
- Q06: builds pass with zero drift; the new module is in the built output. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR is a Deploy UI change; it does not close it. Hosted UAT remains pending, as the task record states: the hosted draft's IMP record is unverified (the session could not sign in to hosted Deploy, HTTP 401).

## Release notes

- DEP-23-004 implemented: Workload Settings now opens in a compact view; Edit is explicit. DEP-23-005 remains open for hosted verification.
- GPT to merge. No deployment authorised.
