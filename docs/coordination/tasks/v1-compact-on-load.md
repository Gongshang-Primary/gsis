# Start GSiS tables in Compact

Model: Codex. Claimed 18 November 2026, 05:13 SGT.

- Branch: `codex/v1-compact-on-load`.
- Base: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Reviewer: Muse, at the final commit.
- Scope: PAR-05 in the [Deploy frontend parity audit](v1-deploy-v09-frontend-parity-audit.md). The owner asked for all GSiS tables to start compact after loading and has authorised committing the logged fixes.
- Exact paths: this task, `v1/web/shared/module-shell.js`, `v1/web/shared/suite.css`, `v1/web/shared/core-table.js`, and `tests/v1-product-compact-on-load-browser.mjs`.
- Coordination: the coordinator added shared core width reset to this branch after initial verification. Own only the Compact and load-width portions of `core-table.js` after the layout agent freezes the toolbar/sort work and hands off the file. PR 205 owns separate Versions logic. Neither open PR touches these five files.
- Acceptance: verify actual rendered spacing and width in Admin and a native app. Cover fresh data and delayed tables. Keep filter and editing controls, merged headings, schedule axes, print styles, and the existing manual resizing behavior during edits. Compact presentation has no backend write.

## Verification

The shared stylesheet starts screen cells with compact vertical padding. The shell fits ordinary tables to their content inside an existing scroll frame. Fixed layouts and schedule columns keep their native dimensions. Legacy tables use their existing fitter after rows or controls load. Moving existing rows during sorting does not trigger that refit. The shell waits for the in-progress pointer gesture or focused editor.

Shared column widths apply to the current displayed data. The browser compares replacement rows with the data present when the columns were resized. Sorting and a redraw with the same table data retain the manual widths. When changed data loads, the core removes its own widths so the compact fit returns. The comparison lives only in memory and the width preference clears with the protected page context. The Compact button also invokes the native fitter where the table already uses it.

`TZ=Asia/Singapore npm run build` passed with no tracked generated drift. With Chromium 151 supplied as `GSIS_BROWSER_EXECUTABLE`, `tests/v1-product-compact-on-load-browser.mjs` passed on the built local Workers and synthetic D1. The test measured initial and refreshed Admin Accounts widths, narrow scroll containment, Calendar's fixed weekday columns, and a late-added Deploy table control. The Deploy case retained the active draft, measured the new input after focus left, and sent no save. The Calendar Glossary test proved manual resizing and same-data redraw retention. After a real synthetic Tag save through the owner API and frontend Refresh, its measured width returned to compact. The same check failed on the earlier compact branch that still reapplied old widths. The initial reset also exposed CSS pixel rounding, so the preference now records the width as the browser serializes it. The existing generic table and all 15 Deploy save recovery cases passed during the follow-up. CI is pending.

The reset checks structural renders and replacement rows. Ordinary edits to individual input values do not count as a reload. The suite default reaches all modules that load the shared shell and stylesheet. Direct browser coverage here is Admin, Calendar and Deploy. The deployed site was not exercised.

The test uses the existing synthetic product fixture and the repository's browser and build gates. No new dependency or skill tooling was used. Data authority, recovery, and publication stay in their owning modules. Restore the previous reviewed frontend assets to roll this display change back.

## Release

Functional review and owner merge are pending. Runtime UAT is Not tested. No live data, settings, or deployment changes are in scope.
