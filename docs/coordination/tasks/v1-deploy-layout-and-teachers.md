# Deploy layout and Teachers presentation

Model: Codex. Updated 18 November 2026 05:14 SGT.

- Status: implemented and locally verified; not pushed, no PR. Exact-head CI and independent Muse review pending.
- Builder: Codex. Coordinator: ChatGPT. Functional reviewer: Muse at the eventual exact head.
- Branch: `codex/v1-deploy-layout-and-teachers`.
- Base: main `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Owner/coordinator authorisation: implement the confirmed PAR-01 toolbar displacement, PAR-02 native-sort duplication and PAR-07 Teachers styling/navigation from the [read-only audit](v1-deploy-v09-frontend-parity-audit.md). Keep suite-wide compact sizing separate.
- Claim publication: commit this record only on the isolated task branch. The coordinator explicitly directed **no main claim update, push or PR opening** in this phase. A direct main claim was rejected by automatic approval review; this branch-only claim follows the coordinator's subsequent instruction, not a retry of that action.

## Exact scope

1. This task record.
2. `v1/web/shared/core-table.js`.
3. `v1/web/shared/deploy-ui.js`.
4. New `tests/v1-product-deploy-layout-and-teachers-browser.mjs`.

The coordinator subsequently authorised parallel **non-overlapping hunks** in the core-table path: this task owns only toolbar anchoring and native-sort deduplication, while the Compact task may prepare its separate reset/API/end hunks on its own branch. The coordinator integrates those changes; neither implementer edits the other's worktree. Subject Load column order is owned separately by the coordinator. PR205's Versions module/test and current exact head are untouched. No builder text patch or new dependency.

## Contract

- Place the shared toolbar outside the owning `.assignment-split`, preserving its main-grid and Unassigned-sidebar children. Preserve all existing controls, native group counters, warnings, membership positions, selections, member rows and scrolling. Other wrapper placement remains unchanged.
- Keep an existing native `.sort-button` as its column's sole sorting owner. Do not add a second generic sort button or replace the native block-sort handler. Keep shared filters, resizing and workbook controls available. The oversized filter/compact measurement part of PAR-02 remains queued with suite-wide Compact; do not claim all of PAR-02 closed here.
- Give the first ordinary Deploy header its native dark background and readable light text while retaining the pale filter row.
- Teachers uses alternating visible white/light-blue row fills, including frozen cells. Keep explicit inactive/unknown/capacity labels, actual facts, sorting, filters and all current edit/authority guards. Styling never changes Active or grants eligibility/access.
- Reorder the existing HR Settings list to Teachers, Exclusions, Membership, Offload, HR Terms, Span of Control. Preserve native navigation and unsaved-draft guards.

## Acceptance and boundaries

Use the real built browser/Workers/local D1 fixture with synthetic active, inactive and unknown staff; two groups per organisation kind; and a multirow IP class/TG block. Prove the current layout/duplicate-sort/header/striping/order defects before the fix. Assert desktop and narrow main/sidebar geometry; toolbar outside split; unchanged counters, warnings and trailing member rows; one native sorting control with intact block sorting; header versus filter contrast; visible Teachers row bands through sorting/filtering/refresh; exact HR order/native navigation guards; and no owner writes when opening/styling views. Keep existing table, eligibility, Membership and save-recovery checks unchanged and run relevant regressions.

Run with `TZ=Asia/Singapore`; record the actual browser and commands/results. Canonical build/no generated drift and required exact-head CI remain required before a review-ready claim. No merge, deployment, live-data access, provider action, migration, configuration change, permission-policy edit, Dept move policy or suite-wide compaction is authorised by this task. F5 remains OPEN; hosted authenticated UAT and T1B-01/T1B-02 remain Not tested.

Skill entry: inspected the available catalog and repository skill policy; apply bounded reproduction, native ownership and real-artifact verification manually. No skill package executed or installed. Q01 claim is recorded; Q02-Q07 await implementation/evidence; Q08 is not applicable to deployment in this task.

## Implementation and visible changes

The branch-only claim is `f58929a78eebd72bc697c1b0a94381b3d862a8e5`. This feature keeps the exact four-file scope above.

- Shared controls anchor before an owning assignment split, retaining its original two main/sidebar children. All five group views regain their desktop and narrow placement; controls, unassigned counts, warnings and member rows remain available.
- A header with an existing native sort button keeps that handler as its sole sorting owner. Shared filters and resize controls are still created. Generic tables retain their original sorting implementation; IP sorting continues to move whole class/TG blocks.
- Scoped Deploy presentation restores the native dark first header in IP, Teachers and the five group views. Filter rows keep their pale fill. Duty and other applications' header palettes are not restyled.
- Teachers data rows use normal white/light-blue visible bands, including frozen cells. Inactive/unknown classes, labels, facts, native inactive sorting and draft guards are retained. Dirty controls are excluded from the control background override.
- The existing HR list moves Span of Control to its end without removing another item or replacing a navigation handler. A guarded lookup preserves the existing empty-Deploy/partial-shell fixture where the native settings array does not exist.

PAR-01 and PAR-07 are implemented locally. PAR-02 sorting duplication and first-header contrast are implemented; initial filter sizing remains deferred to the separate suite-wide Compact task. No claim that all of PAR-02 or PAR-05 is closed. The earlier visual queue is implemented by this task, but no merge/deployment is asserted.

## Checks actually run

Commands used `TZ=Asia/Singapore`; browser checks used `GSIS_BROWSER_EXECUTABLE=/tmp/gsis-duplicate-locked-browser/chromium-1234/chrome-linux64/chrome` (locked Chromium 151.0.7922.34). Real product fixtures build to private temporary output and use isolated synthetic Workers/D1; no hosted or provider request.

- New `node tests/v1-product-deploy-layout-and-teachers-browser.mjs`: meaningful red before the fix (`Dept` split has 3 children, expected 2); final PASS, four groups. Covers all five group views at 1440/390px, native `render(true)`, retained counts/notices/trailing members; simple-table sort dedup and multirow class/TG block sorting; first-header/filter contrast; visible Teachers/frozen-cell bands through native sort, filter and refresh; unknown/inactive labels; HR order and invalid-draft navigation guard; unchanged stored documents and no `/change` request.
- Unchanged `node tests/v1-product-tables.mjs`: PASS, including generic sorting/filtering, native column controls, retained width preferences, dialog opt-in, hidden owner fields and empty Deploy.
- Unchanged `node tests/v1-product-deploy-planning-eligibility-browser.mjs`: PASS, seven groups, including real native choices and reporting saves with accepted authority/capacity preserved.
- Unchanged `node tests/v1-product-deploy-memberships-browser.mjs`: PASS, real Membership editing/save/import/publication and uncertain/lost-response recovery.
- Unchanged `node tests/v1-product-deploy-save-recovery-browser.mjs`: PASS, all fifteen groups, including current/historical note receipts, exact retries, protected-context boundaries and direct-save recovery. No timeout, route or assertion change.
- Unchanged `node tests/v1-product-table-deploy-settings.mjs`: PASS, existing workbook operations, no-op/stale/school/value/interval negatives and actual Core edit matrix.
- `npm run build`: PASS; no tracked generated drift. `node --check` on both changed modules and the new test, and `git diff --check`: PASS.

Private logs: `/tmp/gsis-layout-red.log`, `/tmp/gsis-layout-final.log`, `/tmp/gsis-layout-core-tables.log`, `/tmp/gsis-layout-eligibility.log`, `/tmp/gsis-layout-memberships.log`, `/tmp/gsis-layout-recovery.log`, `/tmp/gsis-layout-settings.log`, `/tmp/gsis-layout-canonical-build.log`. The existing filename-based runner discovers the new product test without another file edit.

Internal read-only Codex review identified the absent native settings-array fixture; the guarded reorder fixes it and the unchanged generic test passes. It also prompted the explicit detached soft-render regression. This is not independent Muse approval.

Q01–Q05: satisfied locally by the exact claim, unchanged data/authority ownership, retained native save contracts and bounded presentation changes. Q06: listed local checks pass; full exact-head Node/LORD/product/package CI has not run on this unpushed branch. Q07: coordinator handoff is pending; independent exact-head review and PR are pending. Q08: no release authority exercised. No build dry-runs, hosted authenticated UAT, live records or deployment were tested by this task. F5 remains OPEN; T1B-01/T1B-02 remain Not tested. Rollback is the bounded UI/test commit and requires no schema or data rollback.
