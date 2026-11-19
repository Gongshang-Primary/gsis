# Muse review — PR #216: integrate confirmed Dept moves onto v1.06

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #216, branch `codex/v1-deploy-department-move-v106`, OPEN, MERGEABLE.
- Exact head reviewed: `5cb73991ef909e6eba7df88db4760b8ac5f0a43e`.
- Base: `bd77b27deab417afce859cd80465d7c608ae0ab2` (merge-base of the head against origin/main at review time; deployed v1.06).
- Verdict: **APPROVED at the exact head.**

## What it is

Bounded integration of the department-move change Muse already approved at branch head `3895cb94207e852eafc52bd1fbfa434dccd6a3d4` (record `deb68287`). Assigning a teacher to another department now offers **Move to this department**, showing the old and destination positions. Cancel preserves the existing draft. Confirmation stages one atomic Dept change; the existing Save action commits it. Native saves and canonical Dept imports enforce one distinct department while retaining historical multi-Dept records for explicit repair. The original reviewed branch is unchanged; the prior approval does not substitute for review of this integration head.

## Scope verified

- Diff is exactly the eight paths in the task record `docs/coordination/tasks/v1-deploy-department-move.md`: the task record, `scripts/v1/build-web.mjs`, `tests/v1-product-deploy-departments-browser.mjs`, `tests/v1-product-deploy-departments.mjs`, `v1/services/deploy/model.mjs`, `v1/services/deploy/workbooks.mjs`, `v1/web/shared/deploy-departments-ui.js`, `v1/web/shared/deploy-departments.mjs`. 599 insertions, 17 deletions.
- Port fidelity verified independently: five product/test files are byte-identical to the approved branch head (both Dept tests, `workbooks.mjs`, `deploy-departments.mjs`, `deploy-departments-ui.js`). `model.mjs` differs only by the retained #207 TTb-name projection (import, `ttbNameInputs` carry, `projectPlanningNames` wrapper) — base drift, not a Dept change. `build-web.mjs` differs only by the one Dept UI script inclusion, with the #209 Roster local-export adapter line untouched.
- `git merge-tree --write-tree --name-only origin/main 5cb7399` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No migration, provider activation, configuration or live-data operation. No deployment. No live data change.

## Design read

- `v1/web/shared/deploy-departments.mjs` (new): `departmentChangeConflicts(old, value)` — the final Dept state with more than one Dept where any Dept is new is a conflict; reductions of historical multi-Dept sets are allowed; a confirmed move resolves to the chosen Dept, preserving fixed leadership holes. Source assignments across member/deputy/TL arrays are removed only for the selected teacher; other people's roles remain. An existing inactive destination may be retained during repair without reactivating that teacher. Committee multiple-membership behaviour is unchanged.
- `v1/services/deploy/model.mjs` (`applyEdits`): dept-kind edits check `departmentChangeConflicts(old, value).length === 0`, else `409 DEPARTMENT_MEMBERSHIP_CONFLICT`. `v1/services/deploy/workbooks.mjs` (`validateWorkbook`): canonical Dept imports enforce the same guard. Confirmed moves retain the original complete Dept expected value, including when a later ordinary edit coalesces into the draft. School, identity, current capability, revision, lease/fence, request identity and receipt/recovery checks remain authoritative. Opening a page writes nothing.
- `scripts/v1/build-web.mjs`: wires `deploy-departments-ui.js` into the Deploy page head only.

## CI verified at the exact head

- Node/LORD run 44408822059: head_sha verified `5cb7399`, completed success, all five jobs green.
- Product run 44412108759: head_sha verified `5cb7399`, completed success.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-departments.mjs` — PASS (real native Worker/D1: direct/browser-encoded saves, canonical imports, historical subsets, atomic moves, strict negative boundaries, receipt replay after Worker restart).
- `node tests/v1-product-deploy-departments-browser.mjs` — PASS (actual built browser/Workers/D1: Cancel/prior drafts, explicit Save, repeated moves, full CAS/coalesced rename, retained inactive repair).
- `node tests/v1-product-deploy-workbooks.mjs` — PASS (unchanged canonical workbook program).
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — PASS (unchanged, adjacent Deploy model regression).
- `node tests/v1-product-deploy-planning-eligibility.mjs` — PASS (unchanged, adjacent Deploy model regression).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, from the approved source review): the final state with >1 Dept where any Dept is new is rejected (409); reductions allowed; confirmed move resolves to the chosen Dept. Re-verified locally above through the ported tests.
- N2 (limits, as stated in the PR body): the coordinator left further unchanged integration regressions and the nine dry-runs/local migration upgrade to full CI; they were not rerun locally. The adjacent regressions I ran locally (workbooks, duplicate-contacts, planning-eligibility) all pass, and full CI is green at the exact head. CCA/PLT/Events department-cardinality clarification remains pending an owner decision (from the source task). PAR-03, layout/Compact, venue maintenance and broader Contacts lifecycle work remain separate. Hosted UAT, T1B-01/T1B-02 and N-1 latency remain Not tested; F5 OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Coordinator-authorised bounded integration of an already-approved change; exact scope in the task record.
- Q02: Pass. Existing owner guards and Deploy edit path reused; no new data source or access path.
- Q03: Pass. Capability, revision, lease/fence and request-identity checks retained; no authority-policy change.
- Q04: Pass. Atomic staged move, receipt replay after restart and conflict retention exercised.
- Q05: Pass. Bounded Deploy Worker/model/UI only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a code rollback; saved ordinary Dept revisions remain auditable and are not automatically reversed.
