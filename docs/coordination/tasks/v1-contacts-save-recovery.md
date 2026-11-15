# v1-contacts-save-recovery: UAT004 durable save outcomes

- Status: implemented; focused verification passed; full exact-head results and CI recorded in the implementation PR. Claude review pending.
- Owner/model: Codex; coordinator ChatGPT (v1); independent reviewer Claude.
- Last updated (Asia/Singapore): 15 November 2026.
- Branch: `codex/v1-contacts-save-recovery`.
- Refreshed main: `7b5f1eb2a9c12b9d27ffd9dab4de694f8885aefd`.
- Implementation parent: frozen UAT019 branch `codex/v1-deploy-draft-status`, exact `1f4121a6b54de6f9973934992fea395fdc3cab81`. Published implementation tree equals local tested tree `7391d8a5ac46bd36ca4163a4371b3820c64f0c50`.
- Current implementation head/PR and exact test results: recorded in the implementation PR after verification.
- User authority: read the supplied data-clone UAT ledger as a bug changelog and work through fixes one by one. Source `GSIS_FRONTEND_UAT_LEDGER.md`, SHA-256 `c4c0cb8786eced24b5ef3143c7d113369ddaf81dcba8728e27fb0a2a34c5a0f8`. Historical permissions in that document do not authorise new live operations.

## Exact seven-path scope

1. `v1/services/contacts/grid.mjs`
2. `v1/services/contacts/settings.mjs`
3. `scripts/v1/build-web.mjs`
4. `tests/v1-product-contacts-save-recovery.mjs`
5. `tests/v1-product-contacts-recovery-browser.mjs`
6. `docs/coordination/tasks/v1-contacts-save-recovery.md`
7. `docs/v1/contacts/SAVE_RECOVERY_FIX_2026-11-15.md`

Contacts owns save outcomes and recovery. The builder adapts the reused frontend only for v1. No v0.9 source, shared runtime, schema, authority/acceptance policy, catalogue validation, migration, provider, secret, dependency or live data changes. UAT003 direct-authority editing remains separate with PR158. No merge or deployment.

## Claim and sequencing

Read root/v1 instructions, workflow, lanes, directives, status, deployment and engineering records. Refresh main, relevant branches and all 20 open PR file inventories: none owns these runtime paths. The frozen UAT019 branch also changes the builder; this is an explicit same-builder sequential handoff, not concurrent editing. Its one-line Deploy adaptation is retained byte for byte. UAT019 remains independently reviewable and is the parent PR; PR160's publication recovery remains disjoint. PR159 contains the normalized ledger only.

V1 coordination allows this sequential stacked task while completed predecessors await independent review under the lane coordinator exception. Publish only this claim on current main with an expected-head, non-force update, re-read claims, then merge the accepted claim into the implementation branch immediately. Do not merge/cherry-pick unrelated queue or review branches. Parent changes require child revalidation and a new exact-head review. Production coordination is unchanged.

## Root cause and bounded design

Known validation failure can be durably fenced as aborted. Grid save replay and receipt lookup currently dereference a missing receipt result, converting a confirmed rejection into an exception. Recovery also ignores the durable result returned by `abortOperation`, so a competing original commit can incorrectly be reported aborted.

Reuse existing durable operation receipts, atomic fencing, admission resolution and `/recover-save`. Preserve original operation ID, digest and payload until the durable outcome is known. Only committed receipts supply result mappings. Return actual committed/aborted/prepared/unknown variants without fabricated success or cancellation.

Adapt the v1-built Contacts grid: committed settles the original save once; proved abort retains and unlocks the draft for explicit correction/new operation; unknown/prepared/unavailable retains the original frozen attempt. Offer recovery only for the current retained grid attempt, showing its operation reference. Do not invent server-stored drafts or build a general history screen. Existing import receipt handling already recognizes the durable terminal receipt; test it without expanding import scope.

## Acceptance and evidence

1. Reproduce a synthetic Role P/empty-catalogue save rejection through actual local Worker/D1, with no staff write and a durable aborted receipt. Lookup and identical replay must not throw; altered intent must still conflict.
2. Built Contacts browser retains every draft value and unlocks only after terminal proof; corrected intent commits once using a new ID. A response lost after commit recovers the original mapping without duplicate staff.
3. Missing receipt, prepared operation and unavailable lookup keep original identity/payload and lock. A recovery request alone is not proof.
4. Exercise both commit-versus-abort interleavings: report the winning durable outcome; abort fences late commit; committed never unlocks a replacement as if aborted. Verify admission resolution uses that outcome.
5. Restart Worker/adapter between failure and lookup; do not rely on isolate state. Check school/actor isolation, digest mismatch, impersonation, permission changes and pending-attempt account changes.
6. Preserve successful Admin/Contacts Power User saves and DIY receipts. Exercise existing import receipt recovery including retained session identity, without bulk onboarding expansion.
7. Use `TZ=Asia/Singapore`: focused tests, canonical build/no tracked drift, runner discovery, unchanged Core/Contacts regressions, product suite, full Node/LORD and exact-head CI. Record commands, failures, omissions, exact head and allowlist.
8. Claude reviews the exact head. Original live save outcome and runtime UAT remain unverified; no synthetic test closes them.

## Quality, rollback and handoff

Apply the already selected Pstack root-cause approach: reproduce, fix the outcome boundary, prove negative/race cases. No dependency or skill repository added. Claim accepted at `2c396391186a342a0c42c41d961aba30832baf54`; incorporated before implementation in local merge `a0763be57b2305625f48c4ca3a90a63e4b1ae2b3`. Parent UAT019 is PR161. No parent code changed; its builder predicate remains byte-identical.

Q01–Q05 Pass for the bounded implementation: existing durable state/fences reused, matching operation identity required, actual outcome returned, current actor/school/preview boundaries preserved, no new storage/dependency. Q06 focused/build/discovery results below pass; full exact-head CI remains pending until the PR records actual results. Q07 pending Claude. Q08 not applicable to deployment.

Rollback restores the prior code and its recovery limitation; it cannot undo an original committed save. No schema change. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.

## Implemented behaviour and verification

The grid projects terminal receipts without requiring successful result data and validates a supplied lookup digest. Recovery returns the actual receipt from the atomic commit/abort race and resolves admission against that outcome. The v1-built grid retains the frozen original attempt, settles only a matching committed/terminal receipt, preserves rejected draft values, and fences late callbacks by account/login epoch. Check again is read-only; Stop original save explicitly attempts to fence a prepared operation. Import retains its existing nested-terminal-receipt handling. Account clearing resets busy/inert state and private drafts.

Focused commands passed with `TZ=Asia/Singapore` and `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`:
- `node tests/v1-product-contacts-save-recovery.mjs` — seven real Worker/D1 groups: known rejection/replay, lost committed result, permissions/digests/isolation, commit-wins race, abort-wins fence, durable restart and unresolved preparation.
- `node tests/v1-product-contacts-recovery-browser.mjs` — seven built-browser groups, final elapsed 23.546 seconds within the unchanged 45-second runner limit. Covers retained rejection/correction, response loss, unknown/mismatched outcomes, read-only check versus explicit stop, import session recovery and late response after logout.
- Existing `v1-product-core-contacts.mjs`, `v1-product-contacts-ui.mjs` and parent `v1-product-deploy-draft-status.mjs` passed.
- `for f in tests/v1-core-*.mjs tests/v1-contacts-*.mjs; do node "$f" || exit; done` — 12 unchanged programs, 56 cases.
- `npm run build` — no tracked generated drift. Both runner `--list` commands discover both new tests: 76 product / 1,175 Node programs. Syntax and whitespace passed.

Red evidence reproduced unreadable aborted lookup and locked browser recovery. A browser harness wait for network-finished after logout was replaced by awaiting the actual save-handler promise; no timeout or product assertion was weakened. Only the two new tests were formatted with cached Prettier 3.6.2. Local evidence: `/tmp/gsis-contacts-service-red.log`, `/tmp/gsis-contacts-browser-red.log`, `/tmp/gsis-contacts-service-final.log`, `/tmp/gsis-contacts-browser-final3.log`, `/tmp/gsis-contacts-canonical-build.log`, `/tmp/gsis-contacts-contract-regressions.log`. These local paths are supplementary; exact-head CI and PR evidence are the durable handoff.

Run and record `node scripts/v1/test.mjs`, full `npm test` Node/LORD CI and the isolated product/build CI at the published head. Use all three local browser variables (`GSIS_BROWSER_EXECUTABLE`, `ROSTER_TEST_CHROMIUM`, `LORD_TEST_CHROMIUM`) if running locally. Actual results, failures and exact commit are in the PR, not inferred from this command list.

Known limit: the current grid draft remains browser-memory state; service restart tests are not browser-crash recovery. The shared client's endpoint-keyed pending map can retain an original failed save entry after a terminal receipt lookup; that pre-existing bounded-map cleanup is recorded separately, outside this claim's file list. No original live operation was inspected. The Run B ordinary Deploy recovery finding is a separate service/UI path, not closed by this Contacts fix.
