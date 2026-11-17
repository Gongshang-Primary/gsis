# v1 normal New planning version inheritance (PAR-03)

- Status: implemented on the isolated task branch; focused verification passes, full CI and exact-head review pending.
- Model/owner: Codex. Coordinator: ChatGPT v1. Reviewer: Muse at the exact functional head under the current owner assignment.
- Updated: 18 November 2026, Asia/Singapore.
- Branch: `codex/v1-deploy-new-version-inheritance`.
- Base: refreshed main `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Authority: coordinator's bounded implementation instruction following the owner's continuing parity work. The latest owner request to commit the logged changes remains a separate coordinator action.
- Claim handling: the coordinator directs a claim-only commit on this task branch because automatic approval review rejected the direct-main claim action. Do not retry that action or treat this branch record as publication on main. No push, PR, merge or deployment until coordination.

## Exact file scope

1. `docs/coordination/tasks/v1-deploy-new-version-inheritance.md`
2. `v1/services/deploy/model.mjs`
3. `v1/services/deploy/service.mjs`
4. `tests/v1-product-deploy-new-version-inheritance.mjs`

The coordinator gives PAR-03 first product ownership of `model.mjs`; the prospective Department-move task must coordinate any overlap after this task freezes. No builder, shared browser client, publication overlay, v0.9 source, Contacts writer, schema, configuration or generated output is owned here.

## Source and overlap evidence

Read [PAR-03 audit](v1-deploy-v09-frontend-parity-audit.md), current root/v1 instructions, workflow, lanes, status, owner directives, deployments and engineering policy. The audit's actual synthetic owner request at deployed source `1c42db77f1fec0a92e2beac289865ae742a26475` shows New losing one source department, committee, class and EL load while Duplicate retains them. This is not evidence about the creation history of any hosted draft.

Native `public/app.js:475` sends `sourceVersionId` with `duplicate:false`; `v1/services/deploy/service.mjs:881` loads that field only when Duplicate is true. Compare the final v0.9.9y `backend/Code.gs:1299` at `d9d180ced16d32c836a94d67d9cff8d3030eb21d`: ordinary New copies definitions/classes/settings and clears personal assignments; Duplicate retains assignments.

GitHub refresh on 18 November SGT: PR205 remains open at `456f264796ea24ed03a51df9fe3eb96f9edf1cd5`, with product, four regression shards and full-suite green. Its actual changed files are its task record, `v1/web/shared/deploy-publication.js` and `tests/v1-product-deploy-duplicate-selection-browser.mjs`; none overlaps this claim. PR182 is independent v0.9 work at `136ba17589abfe944ee04029874f1c085e6fa9de`, also disjoint. Do not modify or merge either branch as part of this task.

## Contract and implementation boundary

- Honour the explicitly selected `sourceVersionId` for normal New. A missing/deleted/foreign source fails; it must not silently choose another version or empty defaults. No-source first creation retains existing defaults.
- Use a pure copy policy for ordinary New: retain source classes, TG and organisation definitions, stable definition IDs, venue metadata/allocations, Subject Load and other version settings. Clear teaching assignments, teacher notes/drafts, removed-teacher bookkeeping, organisation positions (including additional deputies/TLs/legacy leadership), duty assignees and non-teaching-activity assignees. Reset reporting links and use the existing New-version PAL/relief defaults. Do not introduce guessed default departments or change unrelated settings/assignment policy.
- Refresh the new version from current Contacts through the existing bounded projection/admission path. Do not add identity filters, role inference, default authority records or Contacts writes. Normal New does not retain source-only draft people; Duplicate continues retaining source-only stable identities and assignments while refreshing known Contacts-backed facts under the approved lifecycle.
- Preserve `duplicate:true`, `copyFrom` and `sourceId` copy behavior, including current Contacts refresh. Preserve every source document/publication and its history. New version identity, name/dates and revision remain controlled by the existing create handler.
- Preserve original operation/digest binding, committed replay before mutable source/provider reads, current authorization, school isolation, Contacts dependency pins, D1 atomic creation and existing bounds. No source mutation, cross-D1 atomicity claim, recovery rewrite or automatic retries.

## Acceptance and verification plan

1. Capture tracked red through the actual built normal New control and real local Workers/Core/D1. Seed distinctive source definitions, classes/loads, assignments and personal planning state; confirm the native request carries the selected stable source ID with `duplicate:false`.
2. Prove retained definitions/settings and the exact cleared assignment families, including optional/blank leadership structures, TLs/deputies/legacy committee leadership, duties and non-teaching activities. Assert no shared references in the pure policy and unchanged source D1 rows/document/publication.
3. Prove Duplicate and the two legacy aliases retain their established assignment behavior and refresh current Contacts facts. Normal New uses current Contacts without source-only draft people or new Contacts writes. Do not reimplement the established eleven-field/eligibility suites; run them unchanged.
4. Test no-source first create, missing/deleted/foreign source, denied capability/preview, stable creation ID, same-ID changed intent and response-loss/restart replay. Original committed replay must survive source/Contacts changes without another created version. Stay within the unchanged 45-second per-program limit and existing row/payload bounds.
5. Run `TZ=Asia/Singapore` canonical build before product tests, focused tests, unchanged duplicate/eligibility/storage/workbook regressions, discovery, no tracked build drift, exact four-file scope and required full Node/LORD/product checks. Record actual failures/omissions and exact tested commits. Full exact-head CI and Muse review remain gates before merge.

## Decisions and current evidence

The service now honours the selected source for normal New. A pure model helper retains definitions/settings/room placements and resets the specified assignment families before the unchanged current-Contacts merge. `copyFrom` and `sourceId` retain their historical full-copy semantics even with `duplicate:false`; Duplicate without a source still creates the existing default form. Normal New uses current v1 relief defaults (including SIUE190), not obsolete v0.9 numeric defaults. No new Contacts inclusion/exclusion policy is introduced.

Skill selection: a narrow existing-contract repair uses manual boundary, ownership, simplicity and verification principles; no third-party skill execution or code redistribution claimed. A separate Codex agent inspected the small model/service diff read-only and found no concrete counterexample. That internal inspection is not Muse's independent review.

Local commands ran from the accepted task-only commit `d2fb042bc22eae769fad18df0b3461916245da60` plus the implementation/test changes, before the implementation commit. These working-tree results are not represented as exact-head CI:

- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-deploy-new-version-inheritance.mjs`: tracked red at the inherited-class assertion (`[]` instead of the selected class/ref/venue), after the actual built control's source ID and `duplicate:false` were verified. After the fix, all five groups pass in18.483 seconds, below the unchanged45-second limit. Coverage includes current inactive Contacts/BT refresh, every reset family, unchanged source rows and a synthetic immutable publication fixture, pure independence, aliases/Duplicate/no-source, negative authorization/source cases, a real browser response dropped after owner commit and original-operation restart replay after source deletion and Contacts changes. The publication fixture is not an R2 or hosted-publication proof.
- An intermediate green attempt passed the three positive groups, then its unlinked synthetic reader returned503 before the intended403 access-denial check. Correcting the fixture to a real linked person with three explicitly accepted synthetic authority records retained the403 assertion. This was a test setup correction, not a product or permission change. `/usr/bin/time` was unavailable before one launch; Python measured the same test command instead.
- `TZ=Asia/Singapore npm run build`: base and final canonical builds pass all18 components; zero tracked generated-output drift.
- `TZ=Asia/Singapore node tests/v1-product-deploy-workbooks.mjs`: both existing groups pass unchanged.
- `node scripts/v1/test.mjs --list` and `node tests/run.cjs --list`: the new program is discovered in both runners (129 product/1230 Node programs). Source/test syntax and `git diff --check` pass. Only the four claimed paths are changed relative to the base.

Raw synthetic logs are `/tmp/gsis-par03-red.log`, `/tmp/gsis-par03-green-2.log`, `/tmp/gsis-par03-base-build.log`, `/tmp/gsis-par03-final-build.log` and `/tmp/gsis-par03-workbooks.log`. The tracked test is the repeatable evidence; private logs are not the sole regression artifact.

Unchanged regressions, using `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/<program>`:

- `v1-product-deploy-duplicate-contacts.mjs` passes in30.235 seconds: actual built Duplicate, all eleven Contacts fields, explicit clears, assignments/stable IDs, source isolation and restart replay.
- `v1-product-deploy-planning-eligibility.mjs` passes both groups on its isolated rerun in32.566 seconds. Its initial run passed the first group but hit the existing45-second ceiling while other local suites were active. Retain `/tmp/gsis-par03-planning-eligibility.log` as failed evidence alongside `/tmp/gsis-par03-planning-eligibility-isolated.log`; the test and its timeout were unchanged.
- `v1-product-deploy-storage.mjs` passes in29.898 seconds, including actual D1/R2, dependency/interval/race fences, bounded512-person paging, immutable publication, original receipts, import/restart recovery and venue refresh. Its Core/Venues adapters are synthetic, as the existing test states. Measured dependent-save owner cost remains34 statements, maximum11 binds and3,932 JSON bytes. Log: `/tmp/gsis-par03-storage-isolated.log`.

The implementation/test sources stayed frozen throughout these final checks. The coordinator will record the implementation commit and full exact-head CI results with the handoff; no precommit local result is relabelled as remote CI.

## Review, release and handoff

Q01 scope/overlap and Q02-Q05 local implementation evidence recorded; Q06 focused checks pass, required full Node/LORD/product exact-head CI pending; Q07 Muse review pending. Q08 deployment not authorised. Full suites are reserved for CI at the coordinator's instruction rather than blocking this verified local commit. No hosted reads/writes, migration, provider sends or live configuration. F5 remains OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT remain Not tested.

After local implementation and commits, return exact head and commands/results to the coordinator. Do not push/open a PR until instructed. Rollback is a source revert; it does not delete or rewrite versions already created. Review remains advisory and exact-head-specific.
