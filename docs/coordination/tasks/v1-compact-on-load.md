# Start GSiS tables in Compact

Model: Codex. Claimed 18 November 2026, 05:13 SGT.

- Branch: `codex/v1-compact-on-load`.
- Base: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Reviewer: Muse, at the final commit.
- Scope: PAR-05 in the [Deploy frontend parity audit](v1-deploy-v09-frontend-parity-audit.md). The owner asked for all GSiS tables to start compact after loading and has authorised committing the logged fixes.
- Exact paths: this task, `v1/web/shared/module-shell.js`, `v1/web/shared/suite.css`, and `tests/v1-product-compact-on-load-browser.mjs`.
- Coordination: the layout work owns shared `core-table.js` and `core-table.css`. This branch provides the common display default through the shell and suite stylesheet. PR 205 owns separate Versions logic. Neither open PR touches these four files.
- Acceptance: verify actual rendered spacing and width in Admin and a native app. Cover fresh data and delayed tables. Keep filter and editing controls, merged headings, schedule axes, print styles, and the existing manual resizing behavior during edits. Compact presentation has no backend write.

## Verification

The shared stylesheet starts screen cells with compact vertical padding. The shell fits ordinary tables to their content inside an existing scroll frame. Fixed layouts and schedule columns keep their native dimensions. Legacy tables use their existing fitter after rows or controls load. Moving existing rows during sorting does not trigger that refit. The shell waits for the in-progress pointer gesture or focused editor.

`TZ=Asia/Singapore npm run build` passed with no tracked generated drift. With the locked Chromium 151 path supplied as `GSIS_BROWSER_EXECUTABLE`, the new `tests/v1-product-compact-on-load-browser.mjs` passed on the built local Workers and synthetic D1. It measured the initial and refreshed Admin Accounts table, narrow scroll containment, Calendar's fixed and equal weekday columns, and a late-added table control in Deploy. The Deploy case retained the active draft, measured the new input after focus left, and sent no save. The existing `tests/v1-product-deploy-save-recovery-browser.mjs` passed all 15 groups on the same browser. Syntax and `git diff --check` passed. CI for the final branch is pending.

This branch covers default compact presentation and native first-render fitting. Existing shared column widths can still carry across a renderer replacement within one browser document. If explicit refresh needs to reset those user widths, the table owner must expose a load signal distinct from sort, filter and edit redraws. The shared enhancer's manual-width policy and its current regression remain intact pending that coordination. The deployed site was not exercised.

The test uses the existing synthetic product fixture and the repository's browser and build gates. No new dependency or skill tooling was used. Data authority, recovery, and publication stay in their owning modules. Restore the previous reviewed frontend assets to roll this display change back.

## Release

Functional review and owner merge are pending. Runtime UAT is Not tested. No live data, settings, or deployment changes are in scope.
