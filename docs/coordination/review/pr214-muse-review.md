# Muse review — PR #214: integrate approved New planning inheritance onto v1.06

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #214, branch `codex/v1-deploy-new-version-inheritance-port`, OPEN, MERGEABLE.
- Exact head reviewed: `a48b2d00966ccab1e93668b5a5992baabc9b490c`.
- Base: `bd77b27deab417afce859cd80465d7c608ae0ab2` (merge-base of the head against origin/main at review time; the #211 review record).
- Verdict: **APPROVED at the exact head.**

## What it is

Bounded integration of the New planning version inheritance Muse already approved at branch head `0bc58d5561f41c6d5d26fa7a1fb6b2d3ad4763b8` (record `905dbf8e`). Normal New now honours the selected `sourceVersionId`: it inherits the source's classes, TGs, organisation definitions, venue placements/uses and settings, clears personal assignments and drafts, then refreshes people through the existing Contacts contract. Duplicate and legacy `copyFrom`/`sourceId` keep full-copy semantics. The original reviewed branch is unchanged; the prior approval does not substitute for review of this integration head.

## Scope verified

- Diff is exactly the four paths in the task record `docs/coordination/tasks/v1-deploy-new-version-inheritance.md`: the task record, `tests/v1-product-deploy-new-version-inheritance.mjs`, `v1/services/deploy/model.mjs`, `v1/services/deploy/service.mjs`. 750 insertions, 8 deletions.
- Port fidelity verified independently: the new test is byte-identical to the approved branch's test (empty diff between `0bc58d5` and this head), and the product diff is the approved two-file change applied onto the new base, retaining #207 TTb-name derivation and #210 Versions-note projection.
- `git merge-tree --write-tree --name-only origin/main a48b2d0` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No builder/layout/department change, Contacts write, authority-policy change, schema, migration, configuration, dependency or tracked generated-output change. No deployment. No live data change.

## Design read

- `v1/services/deploy/model.mjs`: new pure helper `newPlanningVersion(source)` — structuredClone of the source, then clears teachers, teacherDrafts, teacherNotes, removedTeachers, assignments; resets each organisation group's slots to the fixed counts (dept 2, comm 4, cca 4, plt 1, events 2) and deletes additionalDeputies/tls/legacyLeadership; clears duty teachers and non-teaching-activity teachers; nulls reporting; resets relief to defaults and PAL to defaults; clears audit, fieldAuthors, saveReceipts; deletes pendingUnitRename, conflictNotices and status. Definitions, classes, settings and venue placements survive.
- `v1/services/deploy/service.mjs` (`create`): the source is now resolved from `copyFrom || sourceId || sourceVersionId` uniformly; when the request is a normal New (not duplicate, not copyFrom/sourceId), the loaded document passes through `newPlanningVersion`. Duplicate and legacy callers keep full-copy semantics. Missing/deleted/foreign sources fail as before; immutable original-operation replay remains before mutable source/provider reads. Existing owner D1 guards, current authorization and the bounded Contacts projection remain authoritative. No cross-D1 atomicity claim.

## CI verified at the exact head

- Node/LORD run 44408370826: head_sha verified `a48b2d0`, completed success, all four regression shards and LORD checks green.
- Manual product run 44408382386: head_sha verified `a48b2d0`, completed success.
- PR-triggered product run 44410846424: head_sha verified `a48b2d0`, completed success on the final attempt. Attempt 1 failed 133/134 on the unchanged `v1-product-stapler-resize.mjs` stalling at `browser.newPage` before navigation/application assertions, reaching the unchanged 45-second runner ceiling (45,194 ms, `ETIMEDOUT`); the same unchanged program passed in 15,023 ms in the exact-head manual run, and the same-head retry passed all 134 product programs. No source, fixture or timeout was changed. The failure was a timing flake in an unchanged program, not an assertion failure.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-new-version-inheritance.mjs` — PASS (5 groups: native New, all retained/reset families, source independence, aliases/Duplicate/no-source, authorization/source denials, lost-response/restart replay).
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — PASS (unchanged).
- `node tests/v1-product-deploy-duplicate-selection-browser.mjs` — PASS (unchanged).
- `node tests/v1-product-deploy-planning-eligibility.mjs` — PASS (unchanged).
- `node tests/v1-product-deploy-storage.mjs` — PASS (unchanged).
- `node tests/v1-product-deploy-ttb-modifiers-browser.mjs` — PASS (unchanged).
- `node tests/v1-product-deploy-note-revision-browser.mjs` — PASS (unchanged).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): at claim `371a799` plus the approved test, native New reached the owner but produced `classes:[]` instead of the selected source class. The passing state is re-verified locally above.
- N2 (integration watch, still open): the layout and compact branches both change `v1/web/shared/core-table.js` in disjoint hunks; whichever merges second needs a clean combined tree + build/browser recheck. This PR does not touch that file. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Coordinator-authorised bounded integration of an already-approved change; exact scope in the task record.
- Q02: Pass. Existing owner guards and Contacts contract reused; no new data source or access path.
- Q03: Pass. Authorization and source denials exercised; no authority-policy change.
- Q04: Pass. Lost-response/restart replay, source independence and no-source behaviour exercised.
- Q05: Pass. Bounded Deploy Worker + model only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green (two runs, one after a timing-flake retry).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a reviewed code revert; stored versions and operation history are retained.
