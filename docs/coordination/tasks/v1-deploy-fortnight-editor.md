# v1-deploy-fortnight-editor: UAT014 input, save and navigation recovery

- Status: merged through PR175; PR165, reviewed head `38dabe6ad46a5f0fdf37baa92811ffca86206cf7`, carrying merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`. Not deployed. See the 16 November checkpoint below; older pending statements are historical.
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

Q01 claim accepted at57c9223b532d5bf6c84ef6b5ffdb79059a5e3cc1 and immediately merged before implementation (local8abe5ad0d7f6e4acbc6a4bfff92376cf19d2c978); Q02–Q05 pass for the bounded frontend adaptation; Q06 focused/build evidence below passed, exact-head full suites pending; Q07 Claude pending; Q08 no release. Apply the already selected root-cause approach, with no third-party repository copied. Rollback restores the input/navigation defect with no data/schema rollback. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested. The next deployment label is v1.01 under the separate release-label task.

## Implemented behavior and focused verification

Only the v1 builder and one new built-browser test change runtime/test code. The helper compares raw fields to current projected values, stages valid edits through the existing queue, removes only a reversed staged field, and preserves other drafts. Fortnight save controls remain stable during blur so focused Save reaches its click handler. Invalid input stays visible; raw-only Discard is explicit. All other pages retain the legacy controls, and all parent builder content outside the new helper/call is byte-identical.

Red: actual built browser 2→3→2→Tab retained dirty=true, `/tmp/gsis-fortnight-browser-red.log`. Green: six groups, 8.48 seconds, `/tmp/gsis-fortnight-browser-green-3.log`; independent rerun `/tmp/gsis-fortnight-browser-independent.log`. The test uses synthetic transport deliberately; it asserts UI/queue behavior, not owning-D1 recovery. An initial expectation that every tab transition is blocked during queueFlight was corrected to match the unchanged source: same-version tab navigation remains possible with inert content and immutable flight, while version and sign-out guards remain. No new global navigation policy or weakened save assertion was introduced.

Passed with TZ=Asia/Singapore and GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium:

- `node tests/v1-product-deploy-fortnight-browser.mjs`: six groups, including numeric/remarks reversal, unrelated queued edits, focused/keyboard Save, invalid1.5/negative/201/badInput, explicit local Discard, uncertain flight identity and read-only restrictions.
- `node tests/v1-product-deploy-draft-status.mjs`: six unchanged groups.
- `node tests/v1-product-contacts-recovery-browser.mjs`: eight unchanged groups.
- Canonical `npm run build`, whitespace and parent-content comparison passed, with no tracked generated drift. Runner discovery includes the new program:77 product/1,176 Node.

Pre-commit formatting used cached Prettier3.6.2 only on the new test, followed by another passing six-group browser run. Unchanged Core/Contacts passed12programs/56cases. Logs: `/tmp/gsis-fortnight-formatted-final.log` and `/tmp/gsis-fortnight-contracts.log`. Full product and Node/LORD CI results and the exact published head belong in the PR. Logs are supplementary local evidence; no deployed or original live incident result is claimed. Independent Claude review remains pending.

## Merge checkpoint — 16 November 2026 (Asia/Singapore)

[PR165](https://github.com/helper-gsps/gsis/pull/165) at reviewed head `38dabe6ad46a5f0fdf37baa92811ffca86206cf7` is included in main by [merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`](https://github.com/helper-gsps/gsis/commit/334731cdb1d4fc5d37d7bdf6de761d668c062994). [Claude's controlling review](https://github.com/helper-gsps/gsis/blob/afeba886cd97f365cfb530200bcf46309812cd1b/docs/coordination/review/v1-pr175-chain-claude-recheck.md) and green exact-head CI were checked before integration. The task claim is closed; prior implementation, test failures and pending checkpoints above remain dated history.

The owner amended the sequence to merge PR175 once, preserving all eleven reviewed heads. This head is an ancestor of that carrying merge; it was not separately reimplemented or resolved by hand. The resulting product tree equals the tested tree outside two review documents. [The merge inventory](v1-merge-records-20261115.md#verified-merge-inventory) records the exact heads, carrying commits and verification. Not deployed; no new hosted UAT, migration or provider send. F5 remains **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
