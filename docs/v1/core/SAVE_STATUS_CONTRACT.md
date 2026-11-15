# Shared save-status presentation contract

Model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude at the exact published head. Updated15 November2026,17:15 Asia/Singapore. **Product implemented; initial full CI failed one existing browser assertion. The authorised test-only correction and amendment gates pass locally; new exact-head CI/Claude review remain pending.** This task changes status presentation only and authorises no merge, deployment, provider action or live-data operation.

## References and scope

| Record | Exact reference |
| --- | --- |
| Frozen classification parent | [`ba818831fc318ccd7c5d5f501aed9dce5d141457`](https://github.com/helper-gsps/gsis/commit/ba818831fc318ccd7c5d5f501aed9dce5d141457), tree `6ef5e38ee4026e1348fc9ca6b225410cd803595b` |
| Accepted claim | Main [`24a8872b506393021824269be18660fa702f8e51`](https://github.com/helper-gsps/gsis/commit/24a8872b506393021824269be18660fa702f8e51) |
| Pre-edit incorporation | Local `6a55e9f9b61656e1fbbe99811d40321302fe056c`; public [`b7c68ed007cc3a12f888c41efa5f7a2c4c4c613a`](https://github.com/helper-gsps/gsis/commit/b7c68ed007cc3a12f888c41efa5f7a2c4c4c613a); same tree `f42ab9597856c5c0e8f84ca63e0d821fd8ca5adb` |
| Branch and allowlist | `codex/v1-global-save-status`; [accepted task](../../coordination/tasks/v1-global-save-status.md), six paths after the coordinator amendment: client, module shell, one new focused test, the existing Deploy recovery browser test, task and this contract |
| Implementation head / PR / CI | Initial head `551801180444a414ca6bd647e9feaf572768ca9a` failed full CI; the eventual PR will identify the corrected head/base and new checks. |

At the accepted-claim checkpoint, all33 actual open-PR inventories were unchanged; overlaps are frozen ancestors only. Main is the accepted claim above; Run B `4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd` and Claude review branch `58e22a7bf7ba4a49caa2caabe877605153b098db` are unchanged. This follow-up is tracked by task name, not an invented official UAT ID. The coordinator expressly permits this serial child after the classification source freeze while its CI/review continues. At that checkpoint classification's full1,191-program CI was running; its parent PR173 is ready for Claude after full1,190/LORD40 and product91 green. No parent result substitutes for child verification.

## Defect and evidence boundary

The shell displays an unknown-save warning on `gsis:uncertain` but does not observe verified settlement. Existing client validators can remove the original pending entry or retain it as terminal history without updating that warning. The classification screenshot is contextual evidence only: its pending count was not captured, so it cannot prove a stale warning by itself.

The independent full-client/full-shell JSDOM probe `/tmp/gsis-global-save-banner-probe.mjs` and `.log` proves pending1 after loss, then pending0 after an exact original retry/matching committed receipt while the old banner remains. A second control retains two unknowns after wrong evidence, then reaches1 and0 after valid committed/terminal-not-committed settlements while the warning remains. Exit0, approximately1.01s; synthetic session/transport with actual hash functions. This proves presentation behavior, not durable owner recovery or a live school outcome. Inherited inspected SHA256: client `f287d6570821babd3deff035cc71797c94034e6ad2b743bb8f477e4b36502f00`; shell `aa37ef9d0edbc4636fadb1383bc8c44bce705eebaec8099feb07b68f0a7c7acb`.

## Ownership and transitions

The existing client pending-entry map owns operation status. The shell owns text only. A nonpersistent uncertainty marker on the existing entry feeds the read-only `GSISV1.saveStatus() -> {contextEpoch, uncertainCount}` snapshot. `contextEpoch` is the existing monotonic security counter, not a private identity; both returned values are small numbers. Count marked, nonterminal entries only when their captured epoch/account/school/preview context still matches the current context. Normal preparation/in-flight work is not automatically uncertain. Do not add a second queue, store, receipt truth, polling loop or durable status metadata.

| Trigger | Derived status and presentation |
| --- | --- |
| Transport loss on the exact current entry | Mark that entry uncertain after checking its identity and captured context; show the uncertainty-owned warning. |
| Existing validator accepts the original terminal proof | Recompute after existing deletion/terminal marking. Clear the warning only when no relevant uncertainty remains; terminal cache entries are settled even while retained. |
| Wrong/plain/unbound acknowledgement or unrelated successful request | Preserve the original uncertainty. Same operation ID alone is insufficient. |
| One of several unknown operations settles | Keep the warning for remaining unknowns; never treat the session as one serial operation. |
| Fresh unsent entry is locally discarded | No durable outcome is inferred and another unknown is unaffected. |
| Protected state/session context clears | Hide old-context presentation immediately, without asserting the old operation committed or aborted. Late old-context callbacks cannot restore or clear the new context's warning. |

The payload-free `gsis:save-status` event lets the shell re-read current derived state; it must not contain a request body, token, email, Staff ID or operation digest. Any retained legacy event must be context-fenced. The shell distinguishes uncertainty-owned text from denied/sign-out/other text. Settlement clears only its own warning, and does not overwrite unrelated errors. Initial shell render reads the snapshot, so load ordering needs no event replay store. Rendering cannot send a write, retry, receipt query, withdrawal or login request. Advancing the security epoch immediately notifies even when protected storage clearing awaits IndexedDB. The shell resets old owned text/error generation once per epoch; the delayed clear event re-reads state and preserves a newer same-epoch warning/error. Session401 hides old uncertainty; successful same-account restoration re-renders retained unresolved evidence. Neither behavior clears an operation or changes authentication.

These details close two peer counterexamples: same-account restoration otherwise failed to announce retained uncertainty, and an old logout rejection could repaint while asynchronous protected-state clearing was blocked. The epoch field is required for presentation ordering, not a second session model.

This applies [R07 request/context binding and R09 recovery](../engineering/RUST_PRINCIPLES.md) to presentation while preserving existing owner validation, fresh authorisation, request bytes/IDs, hash/fence checks, bounded terminal caches and native recovery controls. Resource growth is limited to a marker on an existing bounded entry and a small scalar snapshot/event; no new operation retention capacity is introduced.

## Existing settlement boundaries covered

| Existing path | Implemented observation point; owner behavior unchanged |
| --- | --- |
| `settleMatchingReceipt` and direct lease/create/import/publication/requeue/Calendar helpers | Notify once after the existing verified settlement sequence. Preserve every helper's exact result/identity/digest checks and delivery-versus-commit distinction. |
| `verifyDeployRecovery` used by check/retry/withdraw | Notify after verified terminal metadata is applied. The retained pending-map history entry no longer counts as unknown; map size is not the uncertainty count. |
| `checkLordBookingReceipt` | Notify after its independent original-wire/body-binding proof deletes the exact pending entry; its read-only path bypasses generic receipt settlement. |
| LORD group-binding evidence and terminal-cache trimming | Do not derive status from the separate binding store or change its semantics. Already-terminal history trimming cannot create a new unknown. |
| New-reference persistence failure, reserved/undispatched release, LORD preparation failure | Preserve fresh-only cleanup, original evidence and request identity. Unsent cleanup is not a committed/aborted owner receipt. |
| Protected clear, sign-out, account/school/preview transitions and session401 | Recompute/reset current-context presentation and fence late callbacks; do not delete retained recovery evidence simply to clear text or invent a new logout policy. |

The inspected cleanup inventory came from every generic `pending.delete`/`pending.clear` and terminal assignment plus their consumers, recorded in `/tmp/gsis-global-save-status-design.md`. The focused matrix checks these settlement families without replacing their validators.

## Verification ledger

### Historical initial verification at5518011

| Check | Actual status |
| --- | --- |
| Independent preparation probe | Two synthetic full-client/shell cases pass as described above. This is separate from the tracked red and real owner evidence. |
| Meaningful tracked red | `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-save-status.mjs`: exit1 at pending0 with stale unknown banner; `/tmp/gsis-save-status-red.log`. Elapsed time not recorded. |
| Final focused program | Same command: **11/11 groups pass, exit0,9.705s**; `/tmp/gsis-save-status-final.log`. Original45-second program limit unchanged. |
| Final peer recheck | Three synthetic full-client/shell cases pass in0.667s; `/tmp/gsis-save-status-review-final.mjs`. Not Claude's review. |
| Unchanged regression selection | **22/22 programs pass**, no timeouts, maximum27.045s. All files byte-identical to parent `ba81883`; three implementation/test hashes stayed fixed. `/tmp/gsis-global-save-status-regressions.log`, `-results.json`, `...-regression-files.json`. Exact selection below. |
| Build/syntax/scope | Baseline and final `TZ=Asia/Singapore npm run build` pass18 components with no tracked generated drift. Final `/tmp/gsis-global-save-status-canonical-final.log`. `node --check` passes client, shell and focused test; `git diff --check`, frozen hashes and exact five-path inventory pass. |
| Discovery | `TZ=Asia/Singapore node scripts/v1/test.mjs --list` finds93 product programs; `TZ=Asia/Singapore node tests/run.cjs --list` finds1,192 Node programs. Both include `v1-product-save-status.mjs`; `/tmp/gsis-global-save-status-{product,node}-list.json`. |
| Full exact-head CI / Claude | Initial head5518011 failed full CI as recorded below. Corrected-head1,192-program Node/LORD and93-program product CI plus independent review remain pending. Full local suites were not rerun. |

Ten focused groups exercise the actual full client/shell with synthetic sessions/transport and real hash functions: original terminal proof, multiple unknowns, normal in-flight/unsent work, wrong acknowledgements, every direct-result family, Deploy cached terminal history, LORD read-only receipt cleanup, denied/other text,401 restoration and delayed context changes. The eleventh group uses actual local nine-Worker Contacts owners and built Chromium with synthetic identities: two intentionally lost original responses (one committed, one aborted), exact original wire retry and original receipts, pending/count/banner2→1→0, one committed audit and zero aborted audit. Both are local engineering evidence; neither is hosted/runtime UAT.

The first expanded run passed two groups before a faulty supposed-unsent fixture actually dispatched; it was corrected as a test error. An intermediate11-group pass took9.702s (`/tmp/gsis-save-status-green2.log`) before final test-only refinements;9.705s is the final result. No timing is invented for the original red. Desktop screenshots `deliverables/v1/evidence/save-status/two-unknown.png` and `originals-settled.png` show the same page with and without the uncertainty banner. Its unrelated teaching-information notice remains. No390px-specific visual evidence is claimed.

Tested SHA256 values:

```text
2a3d5e6072bec9064bdfba13c6a055ba6d04b535d623b916de38f1a9d0d13b89  v1/web/shared/client.js
7d7b90c7c5f7a72edd8470c3c56de4170b176c0a93ead3a50bcd88fb68946366  v1/web/shared/module-shell.js
5a99ef75d2c673749df2321f876a05ec64aec1a38f9ca53a8f0b7b4e2a2844be  tests/v1-product-save-status.mjs
```

Each unchanged program ran as `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/<program>` with a45-second process limit. Exact22-program selection (brace notation expands only listed alternatives):

```text
v1-product-web.mjs
v1-product-navigation.mjs
v1-product-web-{signage,starlord,lord,browser,load,workflows}.mjs
v1-product-contacts-{classification-browser,projection-browser,recovery-browser,save-recovery,ui}.mjs
v1-product-deploy-{save-recovery-browser,save-recovery,storage,fortnight-browser,draft-status}.mjs
v1-product-lord-{cart-groups-browser,recovery}.mjs
v1-product-roster-admin-settings-browser.mjs
v1-product-venues-navigation.mjs
```

Q01–Q05 pass locally for the implemented contract and authorised test correction. Q06 passes locally for the corrected test and amendment gates, while new full corrected-head CI remains pending and the initial failure stays recorded; Q07 Claude review remains pending. Q08 is not applicable because deployment is not authorised. No optional skill execution is claimed.

Latest coordinator checkpoint: all34 actual PR inventories refreshed after classification [PR174](https://github.com/helper-gsps/gsis/pull/174); prior33 unchanged, only its frozen five paths added. Run B `ee052420628e3567038df5141c448bc366d0d9ba` adds separate RUN-B-025 (49 source IDs). Its reported baseline SERVICE_DENIED matches the Calendar-bound action addressed in PR172 by source comparison; no hosted fix is certified and no scope is added here. Parent checks remain separate from this child.

### CI failure and authorised sixth path

[Full CI43696959533](https://github.com/helper-gsps/gsis/actions/runs/43696959533) at `551801180444a414ca6bd647e9feaf572768ca9a` passed1,191/1,192 Node programs; `v1-product-deploy-save-recovery-browser.mjs` failed at `4 !== 5`. Shard2 did not run LORD; the other shards each passed40. No retry or PR was opened. The coordinator amended the task before test edits to include that existing browser program; product source, validators and timeouts remain unchanged. Failed log: `/tmp/gsis-global-save-ci-5518011/shard-2-attempt1.log`.

A controlled real-Worker/Chromium probe held the original post-commit sync reply. At the inherited `!queueFlight` wait, the owner was revision1/value4 while the browser was revision0, refreshing/inert and without an applied snapshot. The test bypassed that disabled UI with a programmatic write, got a correct409 `REVISION_CONFLICT`, then discarded it as if it were a successful lost commit; the owner correctly retained4 and its receipt was terminal-not-committed. This reproduces a reachable fixture fault, not the exact uninstrumented CI interleaving. The probe's later cleanup timed out because its aborted draft remained; its exit1 is not a positive correction pass. Evidence: `/tmp/gsis-global-save-refresh-boundary-findings.md` and companion probe/log.

The amended test adds a deterministic real-response barrier, waits for original settlement **and** current snapshot application/completed refresh, and asserts both lost-response fixtures are committed successes. All15 groups and original wire/lease/receipt/no-resend/durable-value assertions remain. This applies R07 to distinct operation/read completion boundaries; no product behavior was changed. The corrected program passed in15.643s before formatting and16.065s after formatting (`/tmp/gsis-global-save-refresh-test-final.log`); SHA256 `423b3d39b1a4352e69753ae25d16e2c1b4bd6151483488ac8a9e75d435a853f1`.

The first correction launch (`/tmp/gsis-global-save-refresh-test-green1.log`) stopped because `/usr/bin/time` was absent; Node did not execute, so it is not a test failure. The successful timed runs used Bash timing.

The earlier11 save-status groups and22 unchanged regression passes are historical evidence at5518011. One of the22 regression programs is now amended; the remaining21 are unchanged and were not rerun for this amendment. Final local amendment gates pass: canonical18/no tracked drift (`/tmp/gsis-global-save-status-canonical-correction.log`), four JavaScript syntax checks, whitespace, exact six total paths against pre-implementation `b7c68ed`, unchanged three original hashes and stable amended-test hash. Discovery remains93 product/1,192 Node. New full corrected-head Node/LORD/product CI is pending. Contacts B keeps its accepted claim/worktree, with source edits paused until this corrected parent is reverified.

The four local documentation links resolve; external links/CI are not certified by this check. Reproduce it from the repository root:

```bash
python3 - <<'PY'
from pathlib import Path
import re
for name in ["docs/coordination/tasks/v1-global-save-status.md", "docs/v1/core/SAVE_STATUS_CONTRACT.md"]:
    path = Path(name)
    for target in re.findall(r"\[[^]]*\]\(([^)]+)\)", path.read_text()):
        if "://" not in target and not target.startswith("#"):
            assert (path.parent / target.split("#")[0]).resolve().is_file(), target
print("Local documentation links pass")
PY
```

## Limits and rollback

This is an in-memory, current-context presentation correction. It adds no reload uncertainty persistence, automatic reconciliation, owner mutation, schema conversion, new queue or business-policy change. Clearing a banner is never evidence that a durable operation succeeded. Existing validators and unresolved cross-service recovery intervals remain unchanged.

Code-only rollback restores the stale-banner behavior and does not undo operations, receipts or owner data. Independent source findings and live school record repair remain outside this six-path amended task. F5 stays **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. Next: publish one bounded PR, record the actual implementation head/base and full CI, then obtain Claude exact-head review. No merge or deployment.
