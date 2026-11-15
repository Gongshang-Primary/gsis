# v1-deploy-clear-authority: preserve venue-clear source permissions

- Status: merged [PR164](https://github.com/helper-gsps/gsis/pull/164) at reviewed head `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9` as `507255c2e2b3b7d93dbf31542f26c980062ee50b`; not deployed by this merge task.
- Owner/model: Codex; coordinator ChatGPT (v1); independent reviewer Claude.
- Last updated (Asia/Singapore): 15 November 2026, 10:17.
- Branch: `codex/v1-deploy-clear-authority`.
- Refreshed main: `2c396391186a342a0c42c41d961aba30832baf54`.
- Implementation parent: frozen PR160, `codex/v1-deploy-venue-publication`, exact `ab24739203f3bcc03c5b7e6c96f8fa2144a84654`.
- Current implementation head/PR: to be recorded after verification.
- Owner authority: work through the frontend UAT bug queue one bounded group at a time; recursively refresh Git v1 discoveries after each PR. This restores an existing operation-specific permission, without changing the settled general Deploy capability policy.

## Exact four-path scope

1. `v1/services/deploy/service.mjs`
2. `tests/v1-product-deploy-clear-authority.mjs`
3. `docs/coordination/tasks/v1-deploy-clear-authority.md`
4. `docs/v1/accelerated-delivery/DEPLOY_CLEAR_AUTHORITY_FIX_2026-11-15.md`

No production v0.9 source, shared runtime, Core/Contacts contracts, schema, builder, dependencies, configuration, generated outputs, migration, live-data operations, merge or deployment.

## Source and overlap evidence

The accelerated specification at `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`, section 4.2, requires operation-specific source permissions. At deployed source `26bbccd229962700409bb6e9c80b1e9bec170d20`, `backend/Code.gs` lines 1108/1127 requires Admin to clear venue assignments, and line 1128 rejects active/published/publish-next versions. Native `v1/services/deploy/model.mjs` lines 774–778 only checks expected assignments; the save service checks general `deploy.edit`. A constructed request bypasses the UI's narrower restriction.

PR161 at `1f4121a6b54de6f9973934992fea395fdc3cab81` fixes the independent saved-draft UI state mismatch and explicitly preserves/discloses the existing UI-only restriction. This task closes that server gap; it does not reinterpret Admin, SMC or EO policy.

Read current root/v1 instructions and coordination/engineering records. Explicitly fetched all branch heads, refreshed main/claims/reviews and inspected all 22 open PR actual file inventories. Run B is documentation PR162 at `8317d8a033b2bae443f2e8cbff79b5c010754435`. The sole runtime overlap is frozen PR160, owned by the same builder; its exact code is retained as the parent. UAT004 Contacts recovery is frozen at `66092376ba5267fa23f7100c9d7500128b85cda8` while verification runs and is disjoint.

V1 coordinator permits this serial stacked task while frozen predecessors await Claude review. Publish only this claim to main with a non-force expected-head update, re-read claims, then immediately merge the accepted claim into the child branch before implementation. Do not edit the parent PR. Parent changes require child revalidation and exact-head review. Production coordination is unchanged.

## Design and acceptance

Enforce Admin for every clear-assignment edit, including mixed batches, before partial mutation. Reject published/currently active and previously published versions in line with the preserved UI and source restriction. Preserve ordinary Deploy editor capabilities for other edits. Use existing version/publication state and owning-D1 atomic guards so a publication racing the clear cannot evade the restriction. Preserve expected-state/revision checks, read-only impersonation, school isolation and existing immutable receipt/replay semantics. A retry of committed intent remains its original receipt, not a new clear against changed state.

Tests must exercise actual local Worker/D1 behavior:

1. Reproduce non-Admin direct and mixed-batch clears accepted before the fix; after fixing both deny with no partial draft mutation.
2. Admin may clear an eligible unpublished draft, preserving room/class/group/teacher identities; identical committed retry is idempotent.
3. Published/currently active, previously published and publication-in-progress states deny; no admission/revision/receipt success is fabricated.
4. Read-only impersonation, school mismatch and revoked capability deny without writes.
5. Stale preview/assignment/revision conflicts retain existing behavior.
6. Race publication against clear at the durable transaction boundary; whichever wins must leave a coherent version/publication outcome, with the losing forbidden mutation rejected.
7. Run focused tests, unchanged parent Deploy tests and Core/Contacts regressions, canonical build/no tracked drift, runner discovery, product suite and full Node/LORD exact-head CI using `TZ=Asia/Singapore`. Record commands, exact tested head, failures and omissions.

## Quality and handoff

Apply the already selected Pstack root-cause approach; no skill repository or dependency copied. Q01 claim/scope passed at accepted main af58de2b95e82c8b7ad35ae1e6c1a4c820744199; Q02–Q05 passed for the bounded owning-D1 guard and preserved capabilities; Q06 focused evidence below passed, full exact-head results pending; Q07 Claude exact-head review pending; Q08 no release action.

No runtime or original live-data proof is claimed. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested. Rollback reintroduces the server permission gap but requires no schema/data rollback and does not undo saved operations. The next deployment label remains v1.01 under the separate version task.

## Implementation and verification

The service adds a clear-specific current Admin check and an owning-D1 guard against any historical publication or non-aborted prepared publication for the same school/version. It rechecks that guard and the full loaded version revision in the atomic save transaction. An absent preparation outcome remains blocking. Committed identical replay stays ahead of the new-state guard; ordinary edits retain the existing capability policy. No schema, runtime or model file changed.

Actual Worker/D1 red reproduced both direct and mixed non-Admin clears returning 200 with nine/ten changed rows. After the correction, all twelve focused groups pass: both denials without partial writes, ordinary editor writes, Admin clear with identity preservation and committed replay, active/prior publication denial, prepared/orphaned/aborted outcomes, exact school/version scope, preview/foreign/revoked boundaries, stale expectations, and three real publication/clear interleavings. The race fixtures use independent valid lease scopes so the publication guard or full revision check itself determines the result.

Commands completed using TZ=Asia/Singapore (browser checks also set GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium):

- `node tests/v1-product-deploy-clear-authority.mjs`: 12 groups passed; `/tmp/gsis-clear-authority-green3.log`.
- Parent Deploy storage, venues, settings/table and other existing targeted tests passed; exact filenames are recorded in the PR command block. Parent `node tests/v1-product-deploy-venue-ui.mjs`: six built-browser groups passed.
- `for f in tests/v1-core-*.mjs tests/v1-contacts-*.mjs; do node "$f" || exit; done`: 12 unchanged programs, 56 cases passed.
- Canonical build, syntax, cached Prettier 3.6.2 and whitespace passed; no tracked generated drift. Both runners discover the new program: 76 product / 1,175 Node.

Retained failures: the first regression command named nonexistent `tests/v1-product-deploy.mjs` and stopped before assertions; the corrected four-file command passed. Initial race fixtures passed Node Request objects across Miniflare bindings; the harness was corrected to use URL/options against real Worker bindings, without replacing Core authorization. No assertion, production guard or runner timeout was weakened. Root internal source inspection found no further blocker; it is not Claude approval.

The implementation branch immediately merged accepted main claim into frozen PR160 before edits (local merge c603f10da62ac907631e6972970df48b298b0017). The merge includes existing main UAT019/Contacts claim records unchanged; those are ancestry, not new implementation edits. Full clean-head product, Node/LORD and product/build CI evidence and the published head belong in the PR. No original live request or hosted permission test was performed.

## 15 November 2026 — owner-authorised integration

The owner instructed Codex to merge applicable PRs one by one in logical order. Claude's approval and exact-head CI were rechecked before this merge; its tree matches the automatic merge of both parents without hand edits. This closes the implementation/documentation claim represented by this PR. Later UAT findings remain in their own queue and claims; merging is not hosted acceptance. The merge inventory and remaining gates are in `docs/coordination/tasks/v1-merge-records-20261115.md`. No deployment or live-data operation occurred. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested.
