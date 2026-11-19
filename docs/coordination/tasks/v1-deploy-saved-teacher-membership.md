# Issue 212: preserve saved Deploy teacher membership

- Status: implemented; native/owner regression passed, exact-head CI and review pending.
- Owner/model: Codex; v1 coordinator: ChatGPT/Codex.
- Reviewer/model: Muse, exact head; model review is advisory.
- Updated (Asia/Singapore): 19 November 2026.
- Branch: `codex/v1-deploy-saved-teacher-membership`.
- Base: `1abe47d039befd685a02c03ef8116278a12a2711`.
- PR: not opened; no merge or deployment authorised.

## Authority and scope

The owner requested continuing the logged v1 defects. The coordinator authorised this bounded repair after a real synthetic reproduction of [issue 212](https://github.com/helper-gsps/gsis/issues/212), with a task-branch-only claim before product edits. The historical direct-main claim step is superseded for this job. No live database inspection, row population, migration, provider send, main write or deployment is permitted.

Exact nine-path allowlist (coordinator refinement before editing the additional paths):

1. `docs/coordination/tasks/v1-deploy-saved-teacher-membership.md`
2. `v1/services/deploy/model.mjs`
3. `v1/services/deploy/service.mjs`
4. `tests/v1-product-deploy-saved-teacher-membership.mjs`
5. `v1/web/shared/deploy-ui.js`
6. `tests/v1-product-deploy-storage.mjs`
7. `tests/v1-product-contacts-projection.mjs`
8. `tests/v1-product-deploy-internal-links-browser.mjs`
9. `tests/v1-product-deploy-role-memberships-browser.mjs`

No builder, Contacts writer, schema, shared runtime, settings, dependency or generated-output edits. The browser overlay change is limited to explicit `upsertTeacherProfile` creation of a missing Contacts candidate before applying the current v1 projection; `setTeacherField` stays strict. This hunk is disjoint from the active Compact-layout changes. The separately frozen New inheritance port at `a48b2d00966ccab1e93668b5a5992baabc9b490c` and department port own disjoint model/service hunks. Preserve current #207 TTb derivation and #210 Versions notes. Refresh actual overlapping branches before final handoff rather than replacing whole files from historical sources.

The coordinator approved two existing-test additions because their 512-person pagination assertions conflated the Contacts inventory with saved membership. Retain every pagination, byte/count, duplicate/missing page, integrity and source-race assertion; assert the complete inventory on `staffCatalog` and independently assert that saved member IDs remain unchanged. The first corrected native run exposed the adjacent UI assumption: choosing a valid Contacts-only candidate reached `projectEditBase`, which rejected the missing saved row and left Save disabled. This is why the narrow seventh path is required; no general UI rewrite.

The coordinator approved the eighth path after exact-head Node run `44412970952`, shard 1, failed at `78271d05e70f4d4aca6ec7e77fdc3ea101290e8c`: the existing internal-links browser fixture created an empty version, later created Contacts identities, and expected reload alone to make them saved Teachers. Its missing-row selector timed out; 308/309 shard programs passed. Keep all existing empty-school role choices, role-grade, HR import and selector checks, but explicitly save the selected member through the existing authorised owner operation before testing its row. This is a fixture dependency repair, not permission to restore implicit Contacts population or weaken the assertions. Publish this scope refinement before editing the eighth path. Other CI outcomes are still pending and must be inspected before the next implementation push.

The same coordinator-authorised audit confirmed one further occurrence in the role-memberships browser fixture. An unchanged locked-browser run at `afedc3c` failed on its missing saved-member selector at line 163 after Contacts were created later than the empty version (`/tmp/gsis-212-role-red.log`). The ninth path may add only explicit successful membership setup using the existing authorised Contacts-refresh operation, preserving every empty-school, import, custom-group, authority and error assertion. Both fixtures must assert the resulting saved member IDs. No product changes are authorised by these two fixture corrections. The scope-refinement push superseded the earlier Node run's still-running shards; their cancellation is not a pass. Final CI must run at the corrected implementation head.

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

Q01 authority/scope: pass, branch-only claims `5063eac` then published scope refinement `47c80dc` preceded their respective edits. Q02 design: version owns its saved membership; Contacts owns facts and candidate identities. Q03 security and Q04 failure/recovery: local checks pass for established capabilities, preview, original-operation replay and owner CAS; broader exact-head checks pending. Q05 bounds: no larger projections, queries or write limits. Q06 verification: focused local pass, paging regressions and full CI pending. Q07 review: pending. Q08 release: not authorised.

Pstack Prove It Works was read and applied to actual owner-state/native-browser evidence; no third-party skill code copied. Root/v1 instructions, workflow, skill policy and quality gates were read. Hosted runtime UAT and T1B-01/T1B-02 remain **Not tested**; F5 **OPEN**. Source rollback does not restore previously removed rows or reverse intentional owner saves. Any hosted reconstruction requires a separate evidence-backed owner task.

## Implementation and local evidence

The model now supports hydrating only saved IDs or explicitly targeted added IDs. Loaded-version bootstrap, calculations, export, publication and unrelated import reconciliation preserve membership. Bootstrap supplies the full current candidate catalogue separately. Create/Duplicate and explicit Contacts refresh retain their existing seeding calls. Explicit profile/assignment actions admit only the specified identities. A saved removal records its existing snapshot; an explicit re-add supersedes only that person's removal marker. The native UI delegates creation of a missing explicit upsert to its existing mechanism and then reapplies current v1 name/profile logic. No implicit creation from `setTeacherField` is added to the UI.

Commands use `TZ=Asia/Singapore`, independent local temporary paths and locked Chromium `/tmp/gsis-duplicate-locked-browser/chromium-1234/chrome-linux64/chrome`.

- `npm run build`: all 18 components pass before and after the UI change; no tracked generated drift. Logs `/tmp/gsis-212-base-build.log`, `/tmp/gsis-212-ui-build.log`.
- Meaningful completed-regression comparison against unchanged `a48b2d0`: expected failure, two rendered rows versus zero after cached Refresh. The separate original native probe also proves the failed Delete and original aborted receipt. Logs `/tmp/gsis-212-tracked-red.log`, `/tmp/gsis-212-baseline-probe.log`.
- `timeout 45s node tests/v1-product-deploy-saved-teacher-membership.mjs`: five groups pass in 17.126s after the correction. Actual native cached/full Refresh, authoritative empty/legacy membership, targeted Add, Delete/Save/reload, original receipt replay, changed intent, unrelated import/note save, valid-lease stale-revision denial, read-only preview and no Contacts field writes. Log `/tmp/gsis-212-green6.log`.
- Earlier focused attempts first hit fixture-only hidden/auto-open picker assumptions, then exposed the real missing-upsert UI guard. After that product correction, a fixture preview omitted its required operation ID; supplying it preserved the real authority check. No timeout or safety assertion was weakened. The final test additionally uses an exact `reliefResults.teachers=[]` assertion instead of an optional lookup of the wrong DTO key; its exact-head rerun is pending, not claimed by the earlier run.
- `node tests/v1-product-deploy-workbooks.mjs`: both unchanged groups pass. Syntax and `git diff --check` pass. Both runners discover the new program (134 product / 1,235 Node programs on this base).
- The two updated paging regressions, remaining related unchanged programs, full Node/LORD/product CI and Muse's exact-head review are pending. Final commands/outcomes and commit SHA will be recorded in the PR body without changing a reviewed head solely to record CI.

### Exact-head follow-up and CI fixture repair

At frozen product head `78271d05e70f4d4aca6ec7e77fdc3ea101290e8c`, the final five-group regression passed in 17.239s; the updated storage program passed in 36.131s (34 owner SQL statements, at most 11 binds and 3,932 JSON bytes); real Contacts projection passed eight groups in 15.445s, including 512 people over eight coherent pages and unchanged saved member IDs. These complete the earlier pending local checks. Results: `/tmp/gsis-212-exact-results.json`.

The first Node run `44412970952` found the two fixture assumptions documented above. Shard 1 failed 308/309 with the internal-links missing-row selector; shard 2 also recorded the role-memberships missing-row selector before the claim-refinement push superseded the unfinished shards. Shard 3 passed; the cancelled work is not counted as passed. This was not rerun as a presumed infrastructure flake. The full product run `44413004176` at the old implementation head remained pending when these bounded fixture corrections were prepared.

After the eighth and ninth paths were claimed and published at `afedc3c` and `b3a23a3`, respectively, each fixture now explicitly obtains a real owner lease and saves Contacts membership through the existing `acceptContacts` operation, then asserts the durable member IDs. Both original test bodies and assertions are retained. With locked Chromium and the unchanged 45-second ceiling, `tests/v1-product-deploy-internal-links-browser.mjs` passed all existing checks, and `tests/v1-product-deploy-role-memberships-browser.mjs` passed all existing checks in 23.082s. Logs: `/tmp/gsis-212-internal-green.log`, `/tmp/gsis-212-role-green.log`. Product source is byte-identical to the five-group/paging checks above. Syntax and whitespace checks pass. Fresh exact-head Node/LORD and product CI and Muse review remain pending.

A private, disposable composition of product head `78271d0` with the exact Compact/Span product/test hunks from `4b54c3d474689f4f5154857586ae015beb74d102` merged cleanly. Its canonical build passed without tracked generated drift, then the five-group saved-membership program passed in 15.383s and Compact Refresh passed in 15.561s. This is local integration evidence only, not a feature-branch merge or independent approval. Results: `/tmp/gsis-212-integration-results.json`.

An internal Codex peer read-only inspection found no concrete blocker in saved/candidate separation, targeted imports or the UI shim. It ran no tests and is not Muse approval. The removed-person marker does not repair historical dangling assignments; the task explicitly does not perform reconstruction.
