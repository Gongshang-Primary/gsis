# Deploy compact table loading and presentation

- Status: locally verified, exact-head CI and review pending
- Owner and model: Codex
- Reviewer and model: Muse, on the combined exact head
- Updated (Asia/Singapore): 19 November 2026, 06:38
- Branch: `codex/v1-deploy-compact-table-loading`
- Base: `bd77b27deab417afce859cd80465d7c608ae0ab2`
- Scope: UAT PAR-01, PAR-02, PAR-05 and PAR-07, including the owner’s 19 November report on Compact after every load. Integrate the two related table-presentation branches and verify the successful-refresh path on v1.06.
- Exact paths:
  - `docs/coordination/tasks/v1-deploy-compact-table-loading.md`
  - `v1/web/shared/core-table.js`
  - `v1/web/shared/module-shell.js`
  - `v1/web/shared/suite.css`
  - `v1/web/shared/deploy-ui.js`
  - `v1/web/shared/deploy-publication.js`
  - `tests/v1-product-compact-on-load-browser.mjs`
  - `tests/v1-product-deploy-layout-and-teachers-browser.mjs`
  - `tests/v1-product-deploy-compact-refresh-browser.mjs`
- Acceptance: show the reproduced table-geometry defects and the verified initial-load, refresh, sorting, protected-edit, responsive and native schedule behavior against actual local Workers with synthetic data. Successful foreground loads reset manual widths even with unchanged results. Failed or declined reads and local table interactions retain manual sizing. Include canonical build, relevant regressions and exact-head CI.
- Release boundary: frontend and test changes only. No live records, school settings, v0.9 changes, merge or deployment.

## Decisions

The previously reviewed shared Compact and Deploy layout changes both own `core-table.js`. Carry them together in one table-presentation branch for a combined browser check and fresh review. Retain v1.06 note recovery and TTb-name projection. The source reviews cover original heads [35abe1b](../review/pr-compact-on-load-muse-review.md) and [cb4b347](../review/pr-layout-and-teachers-muse-review.md) separately. The [parity audit](v1-deploy-v09-frontend-parity-audit.md) documents the original reproductions. The 19 November follow-up is recorded on `codex/v1-deploy-compact-changelog-20261119` at `bdb1bd6b8cfa57061ca4a2a778622876e2a4c316`.

The claim is published on its branch ahead of product edits, following the v1 branch-only claim practice after the direct-main write was rejected. All open GitHub PRs were checked at the base. The v0.9 #182 draft has no overlapping paths. The inheritance, department and Roster duty branches own separate paths.

## Verification

Deploy requests a compact fit when opening a view, accepting a foreground snapshot, loading a saved version or completing an Audit reload. The signal follows the owning read and its existing context checks. The shared fitter waits for the current gesture or editing focus. This also covers accepted snapshots that reuse the same table nodes. Sorting, rejected reads and local drafts keep their state. Late tables use the shared defaults, including unenhanced tables. Native schedule columns, merged cells and print geometry keep their own sizing.

The earlier layout change restores the five assignment splits, native sorting, dark first-column headers and Teachers row bands. Span of Control is last in HR Settings. Existing draft checks and activity labels remain in effect.

### Local evidence

Tests used Singapore time, locked Chromium 151 and the built frontend with isolated Workers and synthetic D1.

- `tests/v1-product-deploy-compact-refresh-browser.mjs` failed at the unchanged-snapshot width check when the new load signal was withheld. During integration, reopening a view also exposed a reset firing before its native fitter had wired the table. The view matrix found a 5px Workload style overriding the compact spacing. The final run passed **35 Deploy views and 41 visible tables**, with the ASC bell and crosswalk panels opened. It also checked actual manual resizing, native sort, failed and identical-data Refresh, unsaved Versions notes, new version selection, Audit and Duty spans. Stored versions were identical before and after the run.
- `tests/v1-product-compact-on-load-browser.mjs` passed. It covers Admin Accounts and narrow scrolling, Calendar weekday axes and resize on new data, and Deploy controls inserted during a draft.
- `tests/v1-product-deploy-layout-and-teachers-browser.mjs` passed. It covers all five assignment grids at 1,440px and 390px, IP class/TG blocks, contrast, Teachers bands, HR navigation and unchanged stored data.
- `npm run build`, `node scripts/v1/build.mjs`, `node scripts/v1/verify-build.mjs`, syntax and whitespace checks passed. No tracked generated drift. The first dry-run attempt needed a writable isolated Wrangler config directory.

The first [Node/LORD run](https://github.com/helper-gsps/gsis/actions/runs/44410404483) passed three shards. Shard 4 failed the Calendar Glossary width assertion in the original Compact test. That assertion compared the new data's width with the previous data's width. The revised test waits for the same measured shrink and removal of both manual inline widths, then checks against the Compact button's fit for the same loaded rows. The revised test passed with locked Chromium and local owner Workers. This follow-up changes only the test and this record. Exact-head CI restarts for review.

An additional local run measured the Deploy matrix after using the actual Refresh button on the table views that support it. All 41 rendered tables passed again, including the expanded ASC detail panels.

Q01–Q05 are supported by the scoped inventory, real owner-read signal, unchanged mutation/capability paths, local recovery checks and bounded browser fitting. Q06 has local evidence above and awaits exact-head Node/LORD and product CI. Q07 awaits Muse at the integrated head. Q08 is outside this task. Runtime UAT is **Not tested**.

Restore the previous reviewed frontend assets to roll back presentation. There is no data or schema migration. Deployment remains pending owner authorisation.
