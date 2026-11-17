# Muse review — Start GSiS tables in Compact (branch head 35abe1b)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- Branch: `codex/v1-compact-on-load`, no PR open. Reviewed by branch head at the owner's instruction ("review them by branch head").
- Exact head reviewed: `35abe1ba908f232b003f6a1fcd8489509caaaa0b`.
- Base: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Verdict: **APPROVED at the exact head.**

## What it fixes

Per the parity audit (PAR-05), all GSiS tables should start compact after loading. Tables loaded at full width and kept stale manual widths after the data changed.

## Scope verified

- Diff is exactly the five paths in the task record `docs/coordination/tasks/v1-compact-on-load.md`: the task record, `tests/v1-product-compact-on-load-browser.mjs`, `v1/web/shared/core-table.js`, `v1/web/shared/module-shell.js`, `v1/web/shared/suite.css`. 248 insertions, 11 deletions.
- `git merge-tree --write-tree --name-only origin/main 35abe1b` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean (one hit is the CSS selector `[type="password"]` in a `:not()` list, not a credential).
- Presentation change only. No backend write, Worker, workbook, D1 data model, dependency, schema, permission or deployment workflow change. No migration. No live data change.

## Design read

- `suite.css`: screen-only compact vertical padding (3px) on table cells, and `gsis-fit-content` tables (not `.gsis-compact`) get `width: max-content; max-width: 100%`. Print geometry is untouched (`@media screen`).
- `module-shell.js`: `fitLoadedTables` runs on reconcile — ordinary tables are fitted to their content inside an existing scroll frame; schedule grids (weekly/timetable/booking, schedule matrices) are skipped; fitting waits while a pointer gesture is in progress or a focused editor sits inside the table. `.gsis-core-table` tables go through `compactAfterLoad`; `.gsis-compact` tables get one `GSISTableFit` per content set (tracked in a WeakMap, so sorting the same nodes does not refit). Focus-out and pointer-up re-schedule a reconcile.
- `core-table.js`: width preferences now store `{widths, fingerprint}` instead of a bare widths array. `loadFingerprint` hashes row text plus visible control values. `compactAfterLoad` clears the table's own widths when the loaded data differs from the fingerprint, but keeps manual widths when a refresh returns identical values or updates existing row nodes in place (sorting moves the same nodes, so it never triggers a refit). `clearWidths` removes only the inline widths this table set and drops its preference. The Compact button now calls `clearWidths` and invokes the native fitter where the table already uses it. The protected-state clear (`gsis:clear-protected-state`) wipes widths and preferences. The width is recorded as the browser serializes it (`Number.parseFloat(cell.style.width)`), which the record notes was needed after an initial reset exposed CSS pixel rounding.
- The comparison lives only in memory and the width preference clears with the protected page context. A fresh browser document has no earlier width preferences.

## CI at the exact head

- Node/LORD run 44179302708: head_sha verified `35abe1b`, completed **failure** — Regression shard 1/4 failed on `v1-product-contacts-classification-browser.mjs`; shards 2/4, 3/4, 4/4 passed. The other jobs (full-suite) failed as a consequence of the shard failure.
- The failure did **not** reproduce locally: the test passes at the exact head, twice (see Local checks). In the CI log the test printed all eleven of its internal PASS groups and then failed at the 45-second mark, with no assertion error in the log — the same signature as the #193 roster-tables timing note, where a test printed its assertions as passed and was then killed by the 45s per-program ceiling. The test takes ~55s wall time locally, so under CI shard load it sits at or over the ceiling. This reads as a timing flake, not a regression from this change — but it is a real signal that the test is too slow for the ceiling, and it must be watched.
- The failed shard was rerun by the reviewer (`gh run rerun 44179302708 --failed`) and **went green**: run 44179302708 completed success at the exact head, all five jobs green (four regression shards + full-suite). The failure was a timing flake, not a regression, and the merge gate is satisfied.
- No product CI run exists for this branch head: product CI is PR-triggered and no PR is open. That gap is covered locally below; opening a PR will run it.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-compact-on-load-browser.mjs` — PASS (initial and refreshed Admin Accounts widths, narrow scroll containment, Calendar's fixed weekday columns, a late-added Deploy table control with the active draft retained and no save sent, manual-resize and same-data redraw retention, width returning to compact after a real synthetic Tag save and frontend Refresh).
- `node tests/v1-product-contacts-classification-browser.mjs` — PASS, twice (second run 55s wall time).
- `node tests/v1-product-tables.mjs` — PASS.
- `node tests/v1-product-deploy-save-recovery-browser.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (integration, not blocking): this branch and the Layout branch (`codex/v1-deploy-layout-and-teachers`, head cb4b347, approved, record 4aacb02a) both change `v1/web/shared/core-table.js` from the same base, in disjoint hunks per the coordinator's split — layout owns toolbar anchoring and native-sort dedup, Compact owns the reset/API/end hunks. Each merge-tree is clean against main on its own; the coordinator integrates them, and the second merge should be checked for a clean combined tree and a build/browser recheck.
- N2 (limits, as stated in the task record): direct browser coverage is Admin, Calendar and Deploy; the deployed site was not exercised. Hosted runtime UAT remains Not tested. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner request recorded (all GSiS tables start compact after loading); exact scope in the task record.
- Q02: Pass. Presentation-only; data/authority ownership unchanged; no new dependency.
- Q03: Pass. Existing generic table and save-recovery checks pass unchanged.
- Q04: Pass. No backend write; recovery behaviour untouched.
- Q05: Pass. Bounded frontend route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green after the rerun of the failed shard. Product CI has not run (no PR); it must run on the PR.
- Q07: Pass. This exact-head review (by branch head, per the owner's instruction), with the merge gate stated.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is restoring the previous reviewed frontend assets; no schema or data rollback is needed.
