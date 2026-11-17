# Muse review — v1 normal New planning version inheritance (branch head 0bc58d5)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- Branch: `codex/v1-deploy-new-version-inheritance`, no PR open. Reviewed by branch head at the owner's instruction ("review them by branch head").
- Exact head reviewed: `0bc58d5561f41c6d5d26fa7a1fb6b2d3ad4763b8`.
- Base: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Verdict: **APPROVED at the exact head.**

## What it fixes

Ordinary New lost one source department, committee, class and EL load: the native New request carries `sourceVersionId` with `duplicate:false`, but the service loaded that field only when Duplicate was true. Per v0.9 (final v0.9.9y `backend/Code.gs:1299`), ordinary New copies definitions/classes/settings and clears personal assignments; Duplicate retains assignments.

## Scope verified

- Diff is exactly the four paths in the task record `docs/coordination/tasks/v1-deploy-new-version-inheritance.md`: the task record, `tests/v1-product-deploy-new-version-inheritance.mjs`, `v1/services/deploy/model.mjs`, `v1/services/deploy/service.mjs`. 754 insertions, 8 deletions.
- `git merge-tree --write-tree --name-only origin/main 0bc58d5` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean (two hits are synthetic test session cookies/CSRF tokens in the new test fixture, not real credentials).
- No builder, shared browser client, publication overlay, v0.9 source, Contacts writer, schema, configuration or generated output change. No migration. No live data change.

## Design read

- New pure helper `newPlanningVersion(source)` in `model.mjs`: `structuredClone`s the source, then clears teachers, teacher drafts/notes, removed-teacher bookkeeping and teaching assignments; resets each organisation group's slots to empty fixed slots and deletes `additionalDeputies`, `tls` and `legacyLeadership`; clears duty assignees and non-teaching-activity assignees; sets reporting to null; resets relief to the current v1 defaults and PAL to `PAL.defaults()`; clears audit, field authors and save receipts; deletes `pendingUnitRename`, `conflictNotices` and `status`. Retained: source classes, TG and organisation definitions, stable definition IDs, venue metadata/allocations, Subject Load and other version settings. The clone means no shared references with the source document.
- `service.mjs` `create`: the source is now loaded whenever `copyFrom || sourceId || sourceVersionId` is present (previously only when `duplicate && sourceVersionId`). The pure reset applies only on the plain New path — `!duplicate && !copyFrom && !sourceId`. Historical `copyFrom`/`sourceId` callers keep their full-copy semantics, and Duplicate without a source still creates the existing default form. A missing/deleted/foreign source fails through the existing `loadVersion` path; it must not silently choose another version or empty defaults. No-source first creation retains the existing defaults.
- After the reset, the existing bounded projection/admission path refreshes the new version from current Contacts. Normal New does not retain source-only draft people and performs no Contacts writes. No new Contacts inclusion/exclusion policy, identity filter, role inference or default authority record is introduced.
- Original operation/digest binding, committed replay before mutable source/provider reads, current authorization, school isolation, Contacts dependency pins, D1 atomic creation and existing bounds are preserved. No source mutation, cross-D1 atomicity claim, recovery rewrite or automatic retries.

## CI verified at the exact head

- Node/LORD run 44179639761: head_sha verified `0bc58d5`, completed success, all five jobs green.
- No product CI run exists for this branch head: product CI is PR-triggered and no PR is open. That gap is covered locally below; opening a PR will run it.
- The task record states the new test failed meaningfully before the fix (tracked red at the inherited-class assertion, `[]` instead of the selected class/ref/venue) and passed after. That negative control is builder-stated; the local run below re-verifies the passing state.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-new-version-inheritance.mjs` — PASS (five groups: retained definitions/settings and the exact cleared assignment families, pure independence, unchanged source rows, aliases/Duplicate/no-source, negative authorization/source cases, response-loss/restart replay).
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — PASS.
- `node tests/v1-product-deploy-planning-eligibility.mjs` — PASS.
- `node tests/v1-product-deploy-storage.mjs` — PASS.
- `node tests/v1-product-deploy-workbooks.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (overlap, not blocking): the task record gives PAR-03 first product ownership of `model.mjs` and states the Department-move task must coordinate any overlap after this task freezes; the deptmove branch's record confirms PAR-03 froze its disjoint `model.mjs` addition at `0bc58d5` and handed over the Dept region, changing only an import and the `setOrganisation` guard. The two branches are disjoint in `model.mjs` (the helper sits beside `fixedGroupSlots`; the deptmove guard is in `setOrganisation`).
- N2 (limits, as stated in the task record): the publication fixture in the new test is not an R2 or hosted-publication proof. Hosted runtime UAT, T1B-01/T1B-02 remain Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Coordinator's bounded instruction following the owner's parity work; exact scope in the task record.
- Q02: Pass. Pure copy policy; data/authority ownership unchanged; no Contacts writes.
- Q03: Pass. Authorization, school isolation, capability and fence checks retained and exercised.
- Q04: Pass. Atomic creation, original-operation replay and receipt/recovery checks exercised locally and in CI.
- Q05: Pass. Bounded service/model route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green. Product CI has not run (no PR); it must run on the PR.
- Q07: Pass. This exact-head review (by branch head, per the owner's instruction).
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a source revert; it does not delete or rewrite versions already created.
