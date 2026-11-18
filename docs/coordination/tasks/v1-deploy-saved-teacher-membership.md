# Issue 212: preserve saved Deploy teacher membership

- Status: claimed; implementation and exact-head verification pending.
- Owner/model: Codex; v1 coordinator: ChatGPT/Codex.
- Reviewer/model: Muse, exact head; model review is advisory.
- Updated (Asia/Singapore): 19 November 2026.
- Branch: `codex/v1-deploy-saved-teacher-membership`.
- Base: `1abe47d039befd685a02c03ef8116278a12a2711`.
- PR: not opened; no merge or deployment authorised.

## Authority and scope

The owner requested continuing the logged v1 defects. The coordinator authorised this bounded repair after a real synthetic reproduction of [issue 212](https://github.com/helper-gsps/gsis/issues/212), with a task-branch-only claim before product edits. The historical direct-main claim step is superseded for this job. No live database inspection, row population, migration, provider send, main write or deployment is permitted.

Exact seven-path allowlist (coordinator refinement before editing the additional paths):

1. `docs/coordination/tasks/v1-deploy-saved-teacher-membership.md`
2. `v1/services/deploy/model.mjs`
3. `v1/services/deploy/service.mjs`
4. `tests/v1-product-deploy-saved-teacher-membership.mjs`
5. `v1/web/shared/deploy-ui.js`
6. `tests/v1-product-deploy-storage.mjs`
7. `tests/v1-product-contacts-projection.mjs`

No builder, Contacts writer, schema, shared runtime, settings, dependency or generated-output edits. The browser overlay change is limited to explicit `upsertTeacherProfile` creation of a missing Contacts candidate before applying the current v1 projection; `setTeacherField` stays strict. This hunk is disjoint from the active Compact-layout changes. The separately frozen New inheritance port at `a48b2d00966ccab1e93668b5a5992baabc9b490c` and department port own disjoint model/service hunks. Preserve current #207 TTb derivation and #210 Versions notes. Refresh actual overlapping branches before final handoff rather than replacing whole files from historical sources.

The coordinator approved two existing-test additions because their 512-person pagination assertions conflated the Contacts inventory with saved membership. Retain every pagination, byte/count, duplicate/missing page, integrity and source-race assertion; assert the complete inventory on `staffCatalog` and independently assert that saved member IDs remain unchanged. The first corrected native run exposed the adjacent UI assumption: choosing a valid Contacts-only candidate reached `projectEditBase`, which rejected the missing saved row and left Save disabled. This is why the narrow seventh path is required; no general UI rewrite.

## Evidence and implementation contract

Current bootstrap loads the exact school/version rows, then `mergeContacts` appends all current Contacts people absent from saved teachers. The native Teachers screen consequently presents projection-only people as saved members. Delete uses raw saved rows and fails `Unknown staff`. Matching row counts in a deleted similarly named draft do not establish lineage; the owner reader does not select by name.

A temporary synthetic actual browser/nine-Worker/D1 probe at `a48b2d0` reproduced all of these observations: zero durable teacher rows with two visible Contacts identities after hard refresh; native Delete reduced the local list but saved with 400 `Unknown staff`; the exact operation became durably aborted, the original-save check confirmed no commit and retained the draft. Explicit empty `_orders/teachers=[]` and a missing legacy order both produced the same phantom members. Probe: `/tmp/gsis-212-baseline-probe.mjs`; final log `/tmp/gsis-212-baseline-probe.log`. Initial probe failures were test-only assumptions about the route URL and deliberately retained queue state, corrected without product edits. No hosted claim is made.

Separate version membership from current Contacts hydration and the Contacts candidate pool. Ordinary reads, calculations, exports/import reconciliation and unrelated saves must preserve saved member IDs, including a legitimate empty list, retained orphan IDs and legacy records without an order entry. Missing legacy ordering is not proof that Contacts should be silently copied into the draft. Direct row deletion may leave a stale ordering index and bypass revision invalidation; do not manufacture members from that index or another version and do not repair live data.

Keep explicit New/create, Duplicate and Contacts refresh/add semantics explicit. Current facts may refresh a saved member; they must not grant an unrelated Contacts person membership merely because another member was edited. Existing explicit profile/add/assignment operations may introduce only their targeted identities. Keep the separate read-only Contacts choice pool available to the existing native Add-existing and inactive-pool flows. No new eligibility or authority rule.

Deleting a real saved member must remain removed across reload/export and unrelated saves; retain the existing removed-person marker so a candidate-only inactive row is not presented again as a saved row. Preserve exact original-operation replay, stale revision/lease guards, school boundaries and atomic owner D1 commit. This task does not expand deletion to remove allocated teaching/dependency records or redesign deletion permissions. No cross-D1 atomicity claim.

## Verification plan

Use `TZ=Asia/Singapore`, locked Playwright Chromium, actual local Workers/D1 and synthetic identities; keep the existing 45-second program ceiling.

- Canonical build and no tracked generated drift before and after.
- Tracked meaningful red against the claim, then green: exact saved-member display, explicit empty and legacy empty/nonempty, deleted same-name isolation, native Delete/Save/reload, current Contacts-only choices, targeted add without bulk admission, export/read-only isolation, unrelated save preservation, original receipt replay and stale-save rejection.
- Reuse focused pure workbook and actual storage, eligibility, Contacts projection, Duplicate, #207 TTb, #210 note and save-recovery regressions where affected. Record actual outcomes and omissions; do not transfer earlier passes.
- Existing runner discovery, exact file inventory, syntax and whitespace.
- Push only the bounded task branch after local checks. Required exact-head Node/LORD and product CI plus Muse review remain gates; no merge/deployment.

## Quality, recovery and handoff

Q01 authority/scope: claimed. Q02 design: version owns its saved membership; Contacts owns facts and candidate identities. Q03 security and Q04 failure/recovery: preserve established capabilities, source pins, original-operation identities and owner CAS. Q05 bounds: no larger projections, queries or write limits. Q06 verification/Q07 review: pending. Q08 release: not authorised.

Pstack Prove It Works was read and applied to actual owner-state/native-browser evidence; no third-party skill code copied. Root/v1 instructions, workflow, skill policy and quality gates were read. Hosted runtime UAT and T1B-01/T1B-02 remain **Not tested**; F5 **OPEN**. Source rollback does not restore previously removed rows or reverse intentional owner saves. Any hosted reconstruction requires a separate evidence-backed owner task.
