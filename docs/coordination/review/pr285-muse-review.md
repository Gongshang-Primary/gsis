# Review: PR #285 — Align Deploy weekday Recess duties (Muse, exact head bbdb5d98)

Project: v1. Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `bbdb5d98a03e3e41f32393a12744ff83d898a84e`.**

## PR

- #285, `codex/v1-deploy-duty-recess-parity`, "Model: Codex / Align Deploy weekday Recess duties". Reviewer named: Muse at exact head `bbdb5d98`. Merger: GPT.
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Merge-base `3aff1367` (the #286 merge on main).
- Three commits on the merge-base: `0352ca64` (Codex, the alignment change), `369e0e4e` (Antigravity, merge of origin/main `3aff1367`), `bbdb5d98` (Antigravity, the tables-test route-mock fix). The branch name is `codex/`; the last two commits are Antigravity-authored.
- Repairs DEP-23-001 (logged in #283): weekday Recess duties that share a name used to render as one column per stored record (30 columns for six duties × five days); they now share one column per weekday-disjoint name group.

## CI at the exact head

- "Isolated v1 product", run 45114460928, head `bbdb5d98`, event pull_request, completed **success** (29m05s). Log tail: "193/193 product programs passed", including `v1-product-tables.mjs`.
- "Verify GSiS queue changes", run 45114456477, head `bbdb5d98`, completed **success**: full-suite pass, scope pass, regression shards skipping (v1-only change under the #280 scope rule). No waiver needed: this is a `codex/**` branch, so Node/LORD CI ran.
- History: the first head `0352ca64` failed product CI (run 45107347804) on exactly one program, `v1-product-tables.mjs` — a deterministic defect in the PR's own change: the new top-level import of `deploy-duty-ui.js` in `deploy-ui.js` was aborted by the tables test's standalone route mock, which fulfilled only three module paths. The fix at this head serves `deploy-duty-ui.js` in that mock. No rerun was needed; the defect is fixed, not waived.

## Scope

Diff against the merge-base (`3aff1367`): **5 files, 786 insertions, 3 deletions.** The file list matches the task record's exact scope.

| File | Change |
| --- | --- |
| `docs/coordination/tasks/v1-deploy-duty-recess-parity.md` | +50/−2: implementation, verification, gates and handoff |
| `v1/web/shared/deploy-duty-ui.js` | +179, new: weekday Recess projection adapter |
| `v1/web/shared/deploy-ui.js` | +2: import `installDutyProjection` and install it with a read-only duties getter |
| `tests/v1-product-deploy-duty-recess-browser.mjs` | +552, new: seven-group browser test |
| `tests/v1-product-tables.mjs` | +3/−1: serve `deploy-duty-ui.js` in the empty-Deploy route mock |

- `git merge-tree --write-tree --name-only origin/main bbdb5d98` returns a clean tree (`3b927cfb…`). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret values.

## Change, read (not trusted)

- The adapter is a display projection only: `projectDutyPrintHTML` rewrites the native print table's Recess columns; `installDutyProjection` wraps `window.dutyPrintHTML` and `window.dutyPage` once (guarded by a `weekdayProjection` flag). Every editable occurrence keeps its original duty ID and weekday; the native definition editor, selection handler, queue, save, validation and receipts are untouched.
- Grouping rule: same-name Recess records share a column only when their weekday sets do not overlap. Same-day duplicates and unscheduled definitions keep separate columns. First appearance controls column order. A shared column with different times says **Varies by day** and each active cell shows its actual time. The header keeps the native `pd (index+3)` convention and the `46/groups.length` column width, matching the native renderer.
- Fallback is fail-closed: any invalid Recess record (missing/duplicate id, non-string name, days outside 0–4 or duplicated) returns null from the grouping step, and any mismatch in the native table shape (4 header rows, colgroup length, 5 day rows, RECESS headers, per-cell owner/day binding) returns the original HTML unchanged — the prior wide view, never a dropped occurrence. The test proves the malformed-structure and wrong-binding fallbacks are byte-for-byte identical to the input.
- The timing helper (`start.replace(':','')+'–'+end.replace(':','')`) carries the same precondition as the native renderer's identical helper, and saves are gated by `dutyStage` validation; it adds no new throw path beyond the native one.
- Escaping: duty names are rendered through the native `esc()` in the print table and through `textContent` in the projection's time labels; the test asserts a markup-bearing name produces no `<img>` and no `window.unexpectedDutyMarkup`.

## Local verification at the exact head

Worktree `~/workspace/gsis-work/review/wt285-review` at `bbdb5d98`. TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM = Playwright chromium-1234.

- `npm ci` (root): exit 0. `npm ci --prefix v1`: exit 0.
- `node tests/v1-product-deploy-duty-recess-browser.mjs`: exit 0 — **7/7 groups pass** (30 weekday records share six columns pd 3–pd 8 with all original IDs/days and workload/card totals; real Export PDF popup matches screen headers/occurrences with no writes and produces real PDF bytes; real selector/save/reload changes only the intended original ID/day; six weekly records keep the six-column shape; partial overlap preserves both Tuesday occurrences and malformed/binding fallbacks are byte-for-byte; timing exceptions, same-day duplicates, unscheduled days, other categories and escaped labels survive screen/PDF; read-only viewer keeps all occurrences and PDF access with editing disabled).
- `node tests/v1-product-tables.mjs`: exit 0 (the previously failing program).
- `node tests/v1-product-deploy-planning-save-controls-browser.mjs`: exit 0.
- `node tests/v1-product-deploy-group-duty-validation.mjs`: exit 0.
- `npm run build`: exit 0. `git diff --exit-code`: zero tracked drift.
- `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0. The built output (`deliverables/v1/product/web/assets/v1/shared/`) contains the new `deploy-duty-ui.js` alongside `deploy-ui.js`.

## Findings

None.

## Quality gates

- Q01 (scope): five files inside the task record's stated scope. Pass.
- Q02: the change owns only the screen/print projection of duty records; saves, validation, Duty Cards and workload are asserted unchanged by the test. Pass.
- Q03: the test covers the endpoint behaviour, the bound, malformed inputs, escaped labels, read-only access and the fallback. Pass.
- Q04: no deployment, migration or live-data effect. Not applicable.
- Q05: product CI green at the exact head on the fixed head (193/193, run 45114460928); queue CI green (run 45114456477). The earlier head's failure is fixed in this head's diff, not waived. Pass.
- Q06: builds pass with zero drift; the new module is in the built output. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR repairs DEP-23-001; it does not close F5. Hosted/runtime UAT and physical printing remain Not tested, as the task record states.

## Release notes

- DEP-23-001 repaired: Deploy Duty now shows six aligned Recess columns in the grid and PDF. Saves retain the original duty and weekday.
- GPT to merge. No deployment authorised.
