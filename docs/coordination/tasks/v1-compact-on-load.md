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

Pending. Use synthetic local built assets and Workers. Record actual browser checks, canonical build, CI results and any missing coverage.

## Release

Functional review and owner merge are pending. Runtime UAT is Not tested. No live data, settings, or deployment changes are in scope.
