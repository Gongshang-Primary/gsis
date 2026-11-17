# Muse review — PAR-04: one department and confirmed moves (branch head 3895cb9)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- Branch: `codex/v1-deploy-department-move`, no PR open. Reviewed by branch head at the owner's instruction ("review them by branch head").
- Exact head reviewed: `3895cb94207e852eafc52bd1fbfa434dccd6a3d4`.
- Base: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Verdict: **APPROVED at the exact head.**

## What it fixes

A teacher could join two distinct departments. Per PAR-04, selecting someone already assigned elsewhere now offers **Move to this department**, showing affected positions and requiring confirmation. Cancel preserves saved assignments and existing drafts.

## Scope verified

- Diff is exactly the eight paths in the task record `docs/coordination/tasks/v1-deploy-department-move.md`: the task record, `scripts/v1/build-web.mjs`, `tests/v1-product-deploy-departments-browser.mjs`, `tests/v1-product-deploy-departments.mjs`, `v1/services/deploy/model.mjs`, `v1/services/deploy/workbooks.mjs`, `v1/web/shared/deploy-departments-ui.js`, `v1/web/shared/deploy-departments.mjs`. 626 insertions, 17 deletions.
- `git merge-tree --write-tree --name-only origin/main 3895cb9` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean (hits are synthetic test session cookies/CSRF tokens and a test-generated `suite.secret`, not real credentials).
- No permission policy, provider, live data, migration or deployment change. No new persistence table or permission field. No new dependency.

## Design read

- New pure helper `v1/web/shared/deploy-departments.mjs`: `departmentReferences` counts references by stable Staff ID and Department ID across `slots`, `additionalDeputies` and `tls` (not positions inside one department); `departmentChangeConflicts` flags a final state with more than one Dept where any Dept is new relative to the prior set — so A+B to A is allowed (a reduction), A+B to A+C is rejected even though the count is unchanged, and any explicit final single-Dept move is allowed. `proposedDepartmentMoves` requires exactly one added Dept for a move, else throws. `applyDepartmentMoves` removes only that person's references in every other department, preserving fixed leadership holes (Head/Deputy slots are blanked, not removed) and other people's fields, compacting only affected member suffixes, and requiring exactly one target position.
- `model.mjs`: one import plus one guard in `setOrganisation` for kind `dept` — the final-state check returns 409 `DEPARTMENT_MEMBERSHIP_CONFLICT`. Both direct native `setOrganisation` and encoded `patchPlanning` go through this path, so both enforce the rule. The guard sits in the Dept region explicitly handed over by PAR-03 (which froze its disjoint `model.mjs` addition at `0bc58d5`); this branch contains none of PAR-03's unreviewed product code.
- `workbooks.mjs`: the canonical Dept preview/apply path applies the same final-document check, so an explicit one-Dept final move can apply atomically while an invalid increase is rejected without writes. Import cannot guess a destination from conflicting rows.
- `deploy-departments-ui.js` (new v1 module, wired in by one builder line appending its module include to the Deploy page): wraps the existing Dept picker and draft queue. A proposed second Dept opens the move dialog with source/target positions; Cancel keeps the complete prior draft with no request; confirmation stages one normal draft intent using the full captured Dept graph as the native expected value, so a changed Dept graph cannot silently pass a field-only patch. No network write occurs before explicit Save. Changing the version, current graph, session or capability prevents a late confirmation from staging stale intent. Page open performs no data write.
- Pre-existing multi-Dept data is retained and flagged on load and unrelated saves, with explicit buttons to retain one existing destination; an inactive historical teacher's unchanged destination can remain while their other Dept references are removed, without reactivating them. Multiple committees remain allowed with a visual notice. CCA/PLT/Events cardinality is out of scope and unchanged.

## CI at the exact head

- Node/LORD run 44181682565: head_sha verified `3895cb9`, completed **failure** — Regression shard 2/4 failed on `v1-product-deploy-planning-eligibility-browser.mjs` with a TimeoutError; shards 1/4, 3/4, 4/4 passed. The other jobs (full-suite) failed as a consequence of the shard failure.
- The failure did **not** reproduce locally: the test passes at the exact head (see Local checks), as do both Dept programs and the other named regressions. The TimeoutError in CI is in the same timing class as the compact branch's classification failure — a slow browser test under shard load — but the CI log carries no assertion failure, so the local pass is the evidence that the change did not break it.
- The failed shard was rerun by the reviewer (`gh run rerun 44181682565 --failed`) and **went green**: run 44181682565 completed success at the exact head, all five jobs green. The merge gate is satisfied.
- No product CI run exists for this branch head: product CI is PR-triggered and no PR is open. That gap is covered locally below; opening a PR will run it.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-departments.mjs` — PASS (real direct/encoded native routes, same-Dept role arrays, atomic moves/retries, historical subset retention/equal-count swap rejection, canonical invalid/valid imports, strict school/capability/fence/revision/operation guards, unchanged Contacts/Core/other versions/publication history, replay after an actual Worker restart).
- `node tests/v1-product-deploy-departments-browser.mjs` — PASS (Cancel preserving prior drafts, no write until Save, confirmed source-array removal/target assignment, ordinary rename coalescing retaining the original full expected graph, repeated move baselines, inactive non-TL historical repair; existing add/rename/leadership/deletion/committee-default assertions retained).
- `node tests/v1-product-deploy-planning-eligibility.mjs` — PASS.
- `node tests/v1-product-deploy-planning-eligibility-browser.mjs` — PASS.
- `node tests/v1-product-deploy-workbooks.mjs` — PASS.
- `node tests/v1-product-deploy-save-recovery-browser.mjs` — PASS.
- `node tests/v1-product-deploy-memberships-browser.mjs` — PASS.
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (builder line, verified): the deptmove branch's `build-web.mjs` line already contains the integrated #203/#204 module includes (`deploy-ui.js`, `deploy-loads-ui.js`, `deploy-ui-tables.js` as modules) and only appends `deploy-departments-ui.js`. The #203/#204 integration note is closed by the v1.05 integration, not by this branch.
- N2 (limits, as stated in the task record): CCA/PLT/Events cardinality decisions remain pending owner clarification and are unchanged here. Hosted runtime UAT, T1B-01/T1B-02 remain Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner instruction recorded (Move to this department with confirmation); exact scope in the task record.
- Q02: Pass. Dept owner rows remain the authority; helper only counts ordinary references; UI is a draft projection using existing commands.
- Q03: Pass. Actor/school/current capability, known identity, lease/fence, revision and operation-identity checks retained and exercised.
- Q04: Pass. Atomic confirmed save/import, full-graph expected binding, native retry/reused-intent/stale/restart coverage exercised locally.
- Q05: Pass. No dependencies, schema or provider changes; unchanged 45-second programme bound (native Dept program 20s in the builder's run).
- Q06: Pass. Local verification above; exact-head Node/LORD CI green after the rerun of the failed shard. Product CI has not run (no PR); it must run on the PR.
- Q07: Pass. This exact-head review (by branch head, per the owner's instruction), with the merge gate stated.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a code rollback of the module/inclusion/guards; no stored data migration is required. Saved moves remain ordinary auditable Dept revisions and are not automatically reversed.
