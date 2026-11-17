# Deploy layout and Teachers presentation

Model: Codex. Updated 18 November 2026 05:14 SGT.

- Status: branch-only claim; implementation not started.
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

The core-table path is reserved to this task until its bounded change is frozen. The separate Compact task may prepare its disjoint module-shell/styles/test paths; its core width-reset API must follow serially. Subject Load column order is owned separately by the coordinator. PR205's Versions module/test and current exact head are untouched. No builder text patch or new dependency.

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
