# Deploy compact table loading and presentation

- Status: claimed
- Owner and model: Codex
- Reviewer and model: Muse, on the combined exact head
- Updated (Asia/Singapore): 19 November 2026, 06:02
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

Pending. Hosted UAT is Not tested.
