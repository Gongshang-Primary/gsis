# Muse review — Deploy layout and Teachers presentation (branch head cb4b347)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- Branch: `codex/v1-deploy-layout-and-teachers`, no PR open. Reviewed by branch head at the owner's instruction ("review them by branch head").
- Exact head reviewed: `cb4b347eba6664be6bc9d7c1ac72a91503d622a9`.
- Base: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Verdict: **APPROVED at the exact head.**

## What it fixes

From the parity audit (PAR-01, PAR-02, PAR-07): the shared toolbar sat inside the owning `.assignment-split`, breaking the Deploy layout; a generic sort button duplicated an existing native sort control; the first ordinary Deploy header lacked its native dark background; Teachers rows had no alternating fills; and Span of Control sat in the middle of the HR Settings list instead of last.

## Scope verified

- Diff is exactly the four paths in the task record `docs/coordination/tasks/v1-deploy-layout-and-teachers.md`: the task record, `tests/v1-product-deploy-layout-and-teachers-browser.mjs`, `v1/web/shared/core-table.js`, `v1/web/shared/deploy-ui.js`. 327 insertions, 36 deletions.
- `git merge-tree --write-tree --name-only origin/main cb4b347` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- Presentation change only. No Worker, workbook, D1 data model, dependency, schema, permission or deployment workflow change. No migration. No live data change. No Dept move policy or suite-wide compaction in this branch.

## Design read

- `core-table.js` toolbar anchoring: the bar is now placed before the nearest `.assignment-split` when one exists, falling back to the previous `.table-window`/`.gsis-core-scroll` anchor. The split keeps its original two main/sidebar children; all five group views regain desktop and narrow placement.
- Sort dedup: the generic `gsis-core-sort` button is created only when the header cell has no native `.sort-button`, so an existing native sort handler stays its column's sole sorting owner. Generic tables keep their original sorting implementation; IP sorting continues to move whole class/TG blocks.
- `deploy-ui.js` adds a scoped Deploy style block: the first ordinary header gets its native dark background (#19485e) with white text on IP, Teachers, Dept, Committees, CCAs, PLT and Events, while the pale filter row is retained. Teachers data rows use alternating white/light-blue bands through a `--row-band` variable, including frozen cells; dirty controls are excluded from the control background override, and inactive/unknown/capacity labels, facts, sorting, filters and edit/authority guards are retained. Styling never changes Active or grants eligibility/access.
- HR Settings list: Span of Control is moved to the end with a splice/push, guarded by a `typeof settingsSections !== "undefined"` check so the empty-Deploy/partial-shell fixture (where the native settings array does not exist) keeps working.

## CI verified at the exact head

- Node/LORD run 44179331860: head_sha verified `cb4b347`, completed success, all five jobs green.
- No product CI run exists for this branch head: product CI is PR-triggered and no PR is open. That gap is covered locally below; opening a PR will run it.
- The task record states the new test failed meaningfully before the fix (`Dept` split has 3 children, expected 2) and passed after. That negative control is builder-stated; the local run below re-verifies the passing state.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-layout-and-teachers-browser.mjs` — PASS (four groups: all five group views at 1440/390px, native render, retained counts/notices/trailing members; simple-table sort dedup and multirow class/TG block sorting; first-header/filter contrast; visible Teachers/frozen-cell bands through sort, filter and refresh; unknown/inactive labels; HR order and invalid-draft navigation guard; unchanged stored documents and no `/change` request).
- `node tests/v1-product-tables.mjs` — PASS.
- `node tests/v1-product-deploy-planning-eligibility-browser.mjs` — PASS.
- `node tests/v1-product-deploy-memberships-browser.mjs` — PASS.
- `node tests/v1-product-deploy-save-recovery-browser.mjs` — PASS.
- `node tests/v1-product-table-deploy-settings.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (integration, not blocking): this branch and the Compact branch (`codex/v1-compact-on-load`, head 35abe1b) both change `v1/web/shared/core-table.js` from the same base, in disjoint hunks per the coordinator's split — layout owns toolbar anchoring and native-sort dedup, Compact owns the reset/API/end hunks. Each merge-tree is clean against main on its own; the coordinator integrates them, and the second merge should be checked for a clean combined tree and a build/browser recheck.
- N2 (limits, as stated in the task record): the oversized filter/compact measurement part of PAR-02 remains queued with suite-wide Compact; this PR does not claim all of PAR-02 closed. Hosted authenticated UAT and T1B-01/T1B-02 remain Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner/coordinator authorisation recorded (PAR-01/PAR-02/PAR-07 from the parity audit); exact scope in the task record.
- Q02: Pass. Presentation-only; data/authority ownership unchanged; no new dependency.
- Q03: Pass. Existing table, eligibility, Membership and save-recovery checks pass unchanged.
- Q04: Pass. Native save contracts retained; no owner writes when opening/styling views.
- Q05: Pass. Bounded frontend route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green. Product CI has not run (no PR); it must run on the PR.
- Q07: Pass. This exact-head review (by branch head, per the owner's instruction).
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is the bounded UI/test commit; no schema or data rollback is needed.
