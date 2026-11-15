# v1-global-save-status: settle the shared unknown-save banner from verified client state

- Status: merged through PR175; PR175, reviewed head `778352626cb5c9eb7ba51633575b16bc7922a078`, carrying merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`. Not deployed. See the 16 November checkpoint below; older pending statements are historical.
- Owner/model: Codex. Coordinator: ChatGPT v1.
- Reviewer/model: Claude, independent exact-head reviewer; review pending.
- Last updated (Asia/Singapore): 15 November 2026, 17:15.
- Branch: `codex/v1-global-save-status`.
- Base SHA: frozen published classification `ba818831fc318ccd7c5d5f501aed9dce5d141457`, complete tree `6ef5e38ee4026e1348fc9ca6b225410cd803595b`; local equivalent `461f538` has the same tree. At claim time classification full CI was running at this exact head; its subsequent PR174 is recorded in the final checkpoint below. Its parent PR173 is ready for Claude at f7f9ea2 with full1190/40 and product91 CI green. No parent result counts as this task’s verification.
- Initial implementation head: `551801180444a414ca6bd647e9feaf572768ca9a`; corrected implementation head will be recorded in the PR after publication.
- PR: not created.
- User-authorised scope: the owner's existing instruction to work through v1 frontend findings sequentially. Coordinator selected this as the next bounded fix after classification is published/frozen. The coordinator explicitly authorises this bounded implementation after claim incorporation, as a serial descendant while the frozen parent awaits CI/review. Only this child branch may be edited; no concurrent parent changes. No merge, deployment, live-data change or provider action.
- Files/domains owned (include generated outputs): exactly the six paths below after the coordinator's test-only scope amendment; no generated tracked outputs.
- Out of scope: receipt/admission/lease/withdrawal semantics, request identities or bytes, storage schema/reference format, new queue or persistence, business policy, owner service/backend changes, native module editors/build transforms, unresolved operation repair, and other discovery items.
- Acceptance checks: derived current-context uncertainty; verified original settlement clears only the owned warning; multiple operations and wrong/unverified receipts remain protected; denied/unrelated messages and context boundaries are preserved; unchanged recovery regression contracts pass.

## Decisions and changes

### Claim/start gates

Current coordinator main at preparation is `b3406e3359a9eebceaf772bcd5ef2a8c81d64dc3`. Coordinator has rechecked all33 actual open-PR file inventories: generic-client overlap is only frozen ancestors173/168/167; no other module-shell writer was found. The coordinator explicitly selected the next claim after publishing the frozen classification head; source implementation still waits for accepted claim incorporation. Coordinator refreshed all heads/main/discovery/review branches and all33 actual open-PR file inventories immediately before this claim: main b3406e3, RunB 4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd and Claude branch58e22a7bf7ba4a49caa2caabe877605153b098db are unchanged. There is no competing editor; client overlaps are frozen ancestors only. The queue remains48 official source IDs; this additional demonstrated source finding is tracked by task name. Record the classification parent's exact head/tree/PR and actual CI/review state. No parent result substitutes for this child's exact-head evidence.

Follow root/v1 AGENTS, workflow, owner directives, engineering/skill policy and quality gates. Publish only this task via the existing expected-head, non-force claim exception, re-read acceptance/overlap, and incorporate that accepted claim into the selected frozen parent before implementation. Do not edit the frozen classification parent or expand its five-path claim.

### Accepted claim and serial handoff

The claim landed on main at [`24a8872b506393021824269be18660fa702f8e51`](https://github.com/helper-gsps/gsis/commit/24a8872b506393021824269be18660fa702f8e51). Before source edits, local incorporation `6a55e9f9b61656e1fbbe99811d40321302fe056c` and public equivalent [`b7c68ed007cc3a12f888c41efa5f7a2c4c4c613a`](https://github.com/helper-gsps/gsis/commit/b7c68ed007cc3a12f888c41efa5f7a2c4c4c613a) share complete tree `f42ab9597856c5c0e8f84ca63e0d821fd8ca5adb`. Worktree: `/workspace/gsis-v1-global-save-status`; branch `codex/v1-global-save-status`. Incorporation is not an implementation or tested final head.

The coordinator rechecked all33 actual PR file inventories after the claim: unchanged, with no competing writer. Run B remains `4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd`, Claude remains `58e22a7bf7ba4a49caa2caabe877605153b098db`; no official source ID was added. Frozen classification parent [`ba818831fc318ccd7c5d5f501aed9dce5d141457`](https://github.com/helper-gsps/gsis/commit/ba818831fc318ccd7c5d5f501aed9dce5d141457) has full1,191-program CI running and no PR yet at this checkpoint. Its parent [PR173](https://github.com/helper-gsps/gsis/pull/173), exact `f7f9ea2`, is ready for Claude with full1,190/LORD40 and product91 CI green. These parent results are historical context, never child passes. The [save-status contract](../../v1/core/SAVE_STATUS_CONTRACT.md) is the durable design/evidence handoff.

### Exact six-path allowlist

```text
v1/web/shared/client.js
v1/web/shared/module-shell.js
tests/v1-product-save-status.mjs
tests/v1-product-deploy-save-recovery-browser.mjs
docs/v1/core/SAVE_STATUS_CONTRACT.md
docs/coordination/tasks/v1-global-save-status.md
```

### Coordinator amendment before the test correction

ChatGPT v1 authorises only the added existing Deploy recovery browser test path to correct its demonstrated sequencing fault. This does not add a product/recovery-contract change. Full CI43696959533 at published551801180444a414ca6bd647e9feaf572768ca9a failed that program at369 (`4 !== 5`):1,191/1,192 Node programs passed; shard2 LORD did not run, other shards each passed40. No CI retry or PR was opened. Preserve the failed log at `/tmp/gsis-global-save-ci-5518011/shard-2-attempt1.log`.

A controlled actual-Worker/Chromium probe on that exact head held the real post-commit sync response. The original commit had revision1/load4, while the native form was refreshing/inert with revision0 and no current snapshot; the test bypassed its disabled UI through `page.evaluate`, sent revision0, received a real REVISION_CONFLICT, then discarded that rejection as though it were a lost committed reply. The owner correctly retained4 and returned terminal noncommit. This proves a reachable fixture sequencing defect, not the exact uninstrumented CI event history. `/tmp/gsis-global-save-refresh-boundary-probe.log` preserves the evidence and a later probe-cleanup timeout; no positive probe pass is claimed.

The correction must wait for the applied current snapshot and completed refresh before the next programmatic write, and verify that a response deliberately dropped as committed was actually a confirmed success. Keep all original exact-wire, lease, no-resend, receipt and durable-value assertions. Add a controlled refresh barrier so the test cannot again assume that clearing queueFlight means the form is ready. No timeout increase, skip, expectation reduction, source edit or extra runtime path is authorised. Contacts B source work remains paused until this parent is reverified; its claim/worktree stay intact.

The focused save-status test and two documents are new; the added Deploy browser test is an existing regression program. No dependency/CI/configuration/builder/canonical v0.9 edits. A necessary extra path requires coordinator approval before editing it.

### Reported issue and source evidence

This is a new bounded source follow-up, not an invented official UAT ID. The classification narrow screenshot shows a global unknown-save warning after its real lost-reply/replay scenario, but did not record the global pending count. Its exact pending state cannot be inferred from the image.

The independent full-current-client/shell JSDOM probe `/tmp/gsis-global-save-banner-probe.mjs` instead proves the defect: lost response gives pending1 and unknown banner; byte-identical original retry with matching committed receipt gives pending0 but leaves the banner. A second control proves two unknowns remain2 after wrong receipt, then1 after one valid settlement, then0 after the second valid terminal-not-committed result while the old warning still remains. Log `/tmp/gsis-global-save-banner-probe.log`, exit0, about1.01s. Synthetic transport/session and real hashes only, no durable owner/Worker/live claim.

Inherited inspected sources at worktree HEAD `b2188da964322c05ad080c73ac749cb59ab404ba`:
- client SHA256 `f287d6570821babd3deff035cc71797c94034e6ad2b743bb8f477e4b36502f00`.
- shell SHA256 `aa37ef9d0edbc4636fadb1383bc8c44bce705eebaec8099feb07b68f0a7c7acb`.

`module-shell.js` assigns the warning on `gsis:uncertain` but has no settlement response. Existing verified client cleanup removes or terminal-marks pending entries without a shell update. Capture the same meaningful failure in the new tracked test before the fix.

### Bounded implementation contract

The client owns whether an original operation remains uncertain. The shell owns only its presentation. Mark transport uncertainty on the existing current-context pending entry; derive a minimal read-only count/snapshot from that map rather than duplicate a queue. No body, tokens, emails or staff payloads in the new notification. Do not persist new status metadata or promise new reload recovery.

Only mark a lost response if the captured epoch/account/school/preview context and exact entry still match. A late old-account rejection must not resurrect the banner. Preserve existing legacy event compatibility where needed; the new shell reads current client state rather than trusting a stale event payload.

Notify after already-verified settlement, including generic terminal receipts, exact direct-result compatibility paths, Deploy verified recovery/withdrawal terminal caching and LORD read-only exact-receipt cleanup. Derive terminal entries as settled even when retained in the existing UI-history cache. Do not modify receipt validators, omit fresh authorisation, clear an operation merely because a status message is cleared, or treat pre-send cleanup as a commit. Context clearing resets this presentation without making any claim that an old operation was committed/aborted.

The final interface is `GSISV1.saveStatus() -> {contextEpoch, uncertainCount}` and a payload-free `gsis:save-status` event. The epoch is the existing nonprivate monotonic security counter, not an account/session identifier. It lets the shell reset old status/error ownership immediately when protected-state clearing advances the epoch but awaits storage; the later clear event cannot erase a newer same-epoch warning/error. A successful same-account session restoration also notifies, restoring an unresolved warning hidden by401. Request/receipt/auth/storage semantics are unchanged.

The shell marks which message it owns as uncertainty. Remove/replace that message when its derived relevant unknown count reaches zero. A successful unrelated request, one of several settlements, same-ID/wrong-domain/digest evidence or unverified acknowledgement cannot clear a genuine remaining warning. Settlement must not wipe permission-denied, sign-out failure or other unrelated status text. Preserve breadcrumb layout and operation-specific recovery controls.

### Acceptance checks

1. Actual full client and shell: lost response → same exact request/ID → valid committed receipt → original pending settles and unknown banner disappears. Repeat with valid terminal-not-committed without claiming Saved.
2. Two or more unknown operations: one settlement leaves the other warning; ordinary in-flight/preparing entries alone do not become fabricated unknown saves. Wrong operation/domain/digest/plain acknowledgement leaves the real original uncertainty.
3. Unrelated reads/writes or local unsent cleanup cannot erase another unknown warning. Existing receipt/hash/fence/request-body contracts and capacity retention stay unchanged.
4. Cover all existing settlement families: generic terminal receipt, direct lease/create/import/publication/requeue/Calendar acknowledgements, Deploy verified terminal recovery (entry remains cached), LORD exact read-only receipt cleanup. Use owner-contract-real hash calculations and label synthetic transport clearly.
5. Delayed transport rejection/terminal response after clear, logout, account/school/preview change cannot repaint or clear the new context. Denial/other shell messages survive unrelated settlements. Notification payload contains no full operation/staff/private body.
6. New test remains under the existing45s program limit. Prefer a fast full-client/full-shell JSDOM matrix; add one actual Chromium shell rendering/control case if practical in the same file. Clearly distinguish browser rendering/transport proof from a durable owner write. No external requests.

## Verification

### Historical initial verification at5518011

All commands use `TZ=Asia/Singapore`; browser programs use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`. The [contract](../../v1/core/SAVE_STATUS_CONTRACT.md) records exact source hashes, full selected regression inventory and fixture/visual limitations.

| Check | Actual result |
| --- | --- |
| Meaningful tracked red | `node tests/v1-product-save-status.mjs` failed at the intended pending0/stale-banner assertion; `/tmp/gsis-save-status-red.log`, exit1. Elapsed time was not recorded. Full client/shell, synthetic transport and real hashes. |
| Final focused test | Same command: **11/11 groups pass, exit0,9.705s**; `/tmp/gsis-save-status-final.log`. Ten full-client/shell matrix groups plus the identified actual local nine-Worker Contacts owner/built-Chromium case. Two lost responses (commit and abort), original exact wire/receipts, pending/count/banner2→1→0, one committed audit and no aborted audit. |
| Review corrections | Same-account session401 restoration and blocked-storage async clear counterexamples fixed. Final three-case synthetic peer recheck passes in0.667s (`/tmp/gsis-save-status-review-final.mjs`); not Claude review. |
| Unchanged regressions | **22/22 programs pass**, no timeouts, maximum27.045s under the unchanged45-second bound. Files are byte-identical to parent `ba81883`; source hashes stable. `/tmp/gsis-global-save-status-regressions.log`, `-results.json`; exact selection in `...-regression-files.json` and contract. |
| Canonical build and local gates | Baseline and final `npm run build` pass18 components/no tracked generated drift. Final log `/tmp/gsis-global-save-status-canonical-final.log`. All three JavaScript files pass `node --check`; whitespace, frozen hashes and exact five-path scope pass. |
| Discovery | `node scripts/v1/test.mjs --list`:93 product programs; `node tests/run.cjs --list`:1,192 Node programs. Both include the new test; `/tmp/gsis-global-save-status-{product,node}-list.json`. Discovery is not a full run. |
| Full exact-head CI / review | Initial head5518011 failed full CI as recorded above. Corrected-head1,192-program Node/LORD,93-program product CI and independent Claude review remain pending. |

An intermediate expanded test passed two groups before a supposed-unsent fixture actually dispatched; the fixture was corrected, not counted as a product defect. Eleven groups then passed in9.702s (`/tmp/gsis-save-status-green2.log`) before final test-only refinements;9.705s is the final result. The original red is retained. Actual local owner/browser evidence is distinct from synthetic matrix/peer evidence and unperformed hosted runtime UAT.

Final discovery checkpoint: all34 actual open-PR inventories refreshed after [parent PR174](https://github.com/helper-gsps/gsis/pull/174); the prior33 were unchanged and only the frozen classification PR's five paths were added. Run B now `ee052420628e3567038df5141c448bc366d0d9ba` adds RUN-B-025, bringing official source IDs to49. Its baseline SERVICE_DENIED report is separate; read-only source comparison identifies the same Calendar-bound action addressed in PR172, not a hosted resolution proof. This discovery did not expand the original five-path task; the separate test-only amendment is recorded above.

### Corrected test verification

The controlled reproduction and authorised sixth path are recorded above. The initial11-group save-status result and22-program local regression result belong to `5518011`. Product source and that focused test remain unchanged. One of those22 regression files now changes; the other21 have not been rerun for this amendment. Do not report a new22/22 run or transfer the old head's full-CI status.

The corrected existing browser program retains all15 groups and original assertions, adds a real refresh barrier, waits for an applied current snapshot, and verifies both deliberately dropped responses are committed successes. Pre-format pass:15.643s; final formatted pass:16.065s in `/tmp/gsis-global-save-refresh-test-final.log`. Tested SHA256 `423b3d39b1a4352e69753ae25d16e2c1b4bd6151483488ac8a9e75d435a853f1`. This is an R07 test-boundary correction: a verified original commit and an applied subsequent read are different completion conditions. Final amendment gates pass: canonical18/no tracked drift (`/tmp/gsis-global-save-status-canonical-correction.log`), four `node --check` checks, whitespace and exact six total paths against pre-implementation `b7c68ed`. The original client/shell/save-status test are byte-identical to5518011; amended test hash is stable. Discovery remains93 product/1,192 Node. New full Node/LORD/product exact-head CI remains pending; no retry or PR was opened on the failed head.

Q01–Q05 **Pass locally** for the bounded contract and authorised test correction. Q06 **Pass locally / corrected-head full CI pending**: the initial CI failure remains recorded; corrected focused test, canonical/syntax/scope/hash/discovery checks pass. A new full run at the corrected head remains required. Q07 PR/exact-head Claude review **Pending**. Q08 **Not applicable — deployment not authorised**.

## Review

Read-only source inventory, synthetic peer counterexamples and final three-case recheck informed the fix. They are not an independent Claude review. Claude reviews the eventual exact implementation head without editing it. Advisory/model review is not human release approval.

## Deployment

Not deployed to staging or production. This task changes display notification only; it must not activate providers, repair records, approve operations or alter recovery guarantees.

## Handoff

Next: publish the bounded implementation PR, record its actual head/base and full CI, then request Claude exact-head review. The coordinator owns source/test assignments and publication; only the two documentation paths were assigned to this documentation agent. Final head/base, exact inventory, CI and Claude review belong in the implementation PR. No optional skill execution is claimed; repository ownership, minimal-state, R07 request/context binding and R09 recovery principles inform this contract.

Code-only rollback restores the misleading banner and does not undo any durable operation or receipt. F5 remains **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. No secrets or private school data belong in the task, test or handoff.

## Merge checkpoint — 16 November 2026 (Asia/Singapore)

[PR175](https://github.com/helper-gsps/gsis/pull/175) at reviewed head `778352626cb5c9eb7ba51633575b16bc7922a078` is included in main by [merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`](https://github.com/helper-gsps/gsis/commit/334731cdb1d4fc5d37d7bdf6de761d668c062994). [Claude's controlling review](https://github.com/helper-gsps/gsis/blob/afeba886cd97f365cfb530200bcf46309812cd1b/docs/coordination/review/v1-pr175-chain-claude-recheck.md) and green exact-head CI were checked before integration. The task claim is closed; prior implementation, test failures and pending checkpoints above remain dated history.

The owner amended the sequence to merge PR175 once, preserving all eleven reviewed heads. This head is an ancestor of that carrying merge; it was not separately reimplemented or resolved by hand. The resulting product tree equals the tested tree outside two review documents. [The merge inventory](v1-merge-records-20261115.md#verified-merge-inventory) records the exact heads, carrying commits and verification. Not deployed; no new hosted UAT, migration or provider send. F5 remains **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
