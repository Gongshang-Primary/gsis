# v1-deploy-fortnight-editor: UAT014 input, save and navigation recovery

- Status: claimed; implementation pending.
- Owner/model: Codex; v1 coordinator ChatGPT; independent exact-head reviewer Claude.
- Updated (Asia/Singapore): 15 November 2026, 10:30.
- Branch: `codex/v1-deploy-fortnight-editor`.
- Refreshed main: `af58de2b95e82c8b7ad35ae1e6c1a4c820744199`.
- Implementation parent: frozen Contacts recovery `codex/v1-contacts-save-recovery`, exact `175f34e55cc3152a60ef0a6865c3bcfb55ab27c5`; includes frozen PR161 at `1f4121a6b54de6f9973934992fea395fdc3cab81`.
- User authority: repair reported frontend UAT bugs serially and refresh Git v1 discoveries after each PR. Uploaded ledger SHA256 `c4c0cb8786eced24b5ef3143c7d113369ddaf81dcba8728e27fb0a2a34c5a0f8`; UAT014. Historical migration permissions are not new live authority.

## Exact four-path scope

1. `scripts/v1/build-web.mjs`
2. `tests/v1-product-deploy-fortnight-browser.mjs`
3. `docs/coordination/tasks/v1-deploy-fortnight-editor.md`
4. `docs/v1/accelerated-delivery/DEPLOY_FORTNIGHT_EDITOR_FIX_2026-11-15.md`

Adapt only the v1-built legacy frontend. Preserve v0.9 sources, server contracts, data ownership, schemas, dependencies, settings and generated tracked outputs. No merge, deployment, migration, live-data access/writes or provider activation.

## Evidence and sequencing

Read current root/v1 coordination and engineering instructions. Explicitly refreshed all remote heads, main, claims, relevant review/discovery branches and all 22 actual open-PR file inventories. PR162 Run B remains `8317d8a033b2bae443f2e8cbff79b5c010754435`. The builder overlaps frozen PR161 and frozen Contacts recovery; this is the same builder's explicit sequential handoff, retaining both parent fixes. Clear-authority implementation at `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9` is disjoint and frozen while suites run.

The v1 coordinator permits this bounded stacked task while predecessors await CI/Claude. Publish only the claim to main using expected-head non-force update, re-read claims, and immediately merge the accepted claim into the child before implementation. Do not edit parent branches. Inherited main claim records are unchanged ancestry, not additional implementation scope. Parent changes require new child verification/review.

A synthetic built-browser probe reproduced number input 2→3→2 before blur: the global unsaved flag remains true, no edit is queued, Save/Discard stay hidden and navigation refuses. Remarks and a changed-then-reverted edit with an existing queue have the same trap. Valid 2→3→Tab queues correctly. Native number input badInput can currently queue a blank value. Evidence is local `/tmp/gsis-uat014.0zdenY/results.json`; it is not runtime UAT.

## Required behavior and acceptance

Keep the existing bounded save queue and server validators. Track raw input and semantic changes for the Fortnight editor, including remarks and number validity. Reverting to the original value clears only that local dirty state without losing a separate queued edit. Expose Save/Discard for actual draft work. Explicit Save while a valid field is focused stages its value through the normal queue. Invalid/badInput stays visibly editable and must never be silently saved as blank.

Do not globally bypass navigation guards, queueFlight or uncertain-save recovery. Discard may discard only unsubmitted local input; unresolved sent operations retain their identity and lock. No browser-crash persistence or ordinary-save recovery expansion.

Actual built-browser tests must cover changed/reverted number and remarks input, existing queued edits, focused valid Save, decimal/out-of-range/badInput, explicit raw-only discard, valid normal save, failed/uncertain save and navigation, keyboard/narrow viewport. Verify no writes on mere editing/reversion and no lost unrelated edits. Keep PR161 and Contacts recovery browser regressions unchanged.

Use TZ=Asia/Singapore: red/green focused browser test, canonical build/no tracked drift, runner discovery, unchanged Core/Contacts and relevant Deploy regressions, full product and Node/LORD exact-head CI. Record actual commands, exact tested head, failures and omissions; Claude reviews the new head.

## Handoff

Q01 scope/claim pending publication; Q02–Q06 pending evidence; Q07 Claude pending; Q08 no release. Apply the already selected root-cause approach, with no third-party repository copied. Rollback restores the input/navigation defect with no data/schema rollback. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested. The next deployment label is v1.01 under the separate release-label task.
