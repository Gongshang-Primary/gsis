# B-R01: ordinary Deploy save recovery

Model: Codex. Implementation is present in the working tree on `codex/v1-deploy-save-recovery`; focused checks pass; publication, full-suite/CI verification and independent Claude exact-head review are pending. This handoff describes implemented behavior and actual development evidence. It does not claim a published tested implementation SHA, resolve an original hosted save, or authorise merge/deployment.

## Exact bases and claim history

| Reference | Exact commit | Role |
| --- | --- | --- |
| Hosted baseline source | [`26bbccd229962700409bb6e9c80b1e9bec170d20`](https://github.com/helper-gsps/gsis/commit/26bbccd229962700409bb6e9c80b1e9bec170d20) | Source comparison only; no new live verification. |
| Main before the initial claim | [`1db6b686b72a1bf54f0bc935982c2aed6cb4f560`](https://github.com/helper-gsps/gsis/commit/1db6b686b72a1bf54f0bc935982c2aed6cb4f560) | Refreshed instructions, claims, all heads and overlapping PR inventories. |
| Frozen Deploy service parent | [`11370014ed8b8eb73b8f0f15ec30eff744f7b1f9`](https://github.com/helper-gsps/gsis/commit/11370014ed8b8eb73b8f0f15ec30eff744f7b1f9) | PR #164 clear-assignment guards, including PR #160 publication recovery at `ab24739203f3bcc03c5b7e6c96f8fa2144a84654`. |
| Frozen builder/client/LORD parent | [`af6065e30c667b453f72b27ffbdec742ceaac92f`](https://github.com/helper-gsps/gsis/commit/af6065e30c667b453f72b27ffbdec742ceaac92f) | PR #167, including ASC `5a2affa6a99ac4511644d0b3e01bcae827774dae`, Fortnight `38dabe6ad46a5f0fdf37baa92811ffca86206cf7`, Contacts `175f34e55cc3152a60ef0a6865c3bcfb55ab27c5` and saved-draft UI `1f4121a6b54de6f9973934992fea395fdc3cab81`. |
| Initial nine-path claim | [`5260b40c06f6a25652530c6a63db35048ec0a619`](https://github.com/helper-gsps/gsis/commit/5260b40c06f6a25652530c6a63db35048ec0a619) | Accepted before implementation. |
| Tenth-path test supplement | [`2e62819640458b9b78438158d1785e570b88d346`](https://github.com/helper-gsps/gsis/commit/2e62819640458b9b78438158d1785e570b88d346) | Existing Fortnight recovery fixture; no added production scope. |
| Eleventh-path test supplement | [`b0266811578109327bb3a51d60d1267647a4ba79`](https://github.com/helper-gsps/gsis/commit/b0266811578109327bb3a51d60d1267647a4ba79) | Existing shared-web WebCrypto fixture and bounded response-compatibility tests. |

The frozen parents were combined without conflicts at local merge `491327f492df0200a359aa841dc92dcb8ade22f6`; the initial claim was incorporated before edits at `44aa8519ac549b62cca2d35971d05d561cc085e2` (tree `c64b602a6c633731b4e3d78c8d4e995ff4bd8908`). Parent service/builder/client/editor blobs were preserved. The tenth-path claim was incorporated at `e08d785e348307e95a5e85d7a9930746381eabeb`, then the eleventh at local HEAD `c77ede80e2da411a8b20650d140aca8874deaa9a`, each before its test was edited. These are local integration/claim references, not a tested implementation commit. The equivalent public integration merges prepared for publication are `ee00e9c70d83eb17a6da33065341ca50e94e40ed` for the combined parents, `16b37c21b723a996a3893c54b2af2f9d4fa635c1` for the initial claim, `bf54b33be7144ed454798feaac9f4a869f029a10` for the tenth path and `6cb5adcb2909177f7f2a1ecf1add252d2c8e8993` for the eleventh. These carry the preserved integration history, not a claimed tested implementation. The coordinator will append the published implementation head, base, PR and final evidence after committing the completed tree.

The [task record](../../coordination/tasks/v1-deploy-save-recovery.md) preserves the initial overlap assessment and both scope supplements. The final publication refresh inspected all 27 open PR file inventories and found no external overlap; main remained `b0266811578109327bb3a51d60d1267647a4ba79`. Run B at prefix `9b6b936` adds separate follow-up findings. No frozen predecessor branch was edited. Later parent changes require revalidation.

## File inventory and ownership

| Exact authorised path | Change and owner boundary |
| --- | --- |
| `v1/services/deploy/service.mjs` | Deploy verifies ordinary recovery bindings and owns same-owner withdrawal/outcomes. |
| `v1/web/shared/client.js` | Bounded request lifecycle, final wire retention, owner-specific settlement, context fences and minimal recovery references. |
| `scripts/v1/build-web.mjs` | V1-only adaptations of existing Deploy and LORD screens. Canonical reused frontend sources remain unchanged. |
| `tests/v1-product-deploy-save-recovery.mjs` | Actual local Worker/Core/D1 recovery, authorization, transaction races and restart. |
| `tests/v1-product-deploy-save-recovery-browser.mjs` | Built native Deploy/client flows, controlled transport failures and actual local owner operations. |
| `docs/coordination/tasks/v1-deploy-save-recovery.md` | Claim, scope supplements and verification state. |
| `docs/v1/accelerated-delivery/DEPLOY_SAVE_RECOVERY_FIX_2026-11-15.md` | This implementation handoff. |
| `v1/web/shared/lord-user.js` | Owned booking editor preparation/persistence ordering and narrow layout. |
| `tests/v1-product-lord-cart-groups-browser.mjs` | Existing cart coverage plus preparation, storage, context and actual native create/edit cases. |
| `tests/v1-product-deploy-fortnight-browser.mjs` | Preserve six behavioral groups while supplying the verified recovery fixture. |
| `tests/v1-product-web.mjs` | Real Node WebCrypto fixture and final shared-client compatibility cases. |

Core retains current authorization and historical decision evidence. LORD retains cart, reservation, custody and outcome authority. Other owners retain their existing response contracts; adapting shared-client settlement does not add a Calendar backend feature or widen module policy. No Core/shared-runtime implementation, LORD backend/model, backend Calendar, schema, migration, configuration, dependency, provider, credential, v0.9 source or tracked generated-output change belongs in this scope.

## Defects corrected and covered UI

The former client retained a save before its automatic lease completed, then sent augmented fields without replacing the retained body. Receipt checks used another endpoint key and left the original pending entry behind. A later receipt could regress cached revision. The reused Deploy queue also cleared uncertain saves on HTTP 400/403/404/409 without durable noncommit proof.

The v1-built UI now covers ordinary queued cell/class edits, direct `change()` editors and row-owned version notes. It retains the original attempt and distinguishes **Check original save**, **Retry original save/preparation** and **Stop original save**. Unknown outcomes block conflicting edits. Check never writes; explicit retry uses complete retained wire; withdrawal is available only after the server proves the original binding. A current owner read, not an old receipt value, refreshes a historical version note. Account/session, version, original attempt, modal and row identity checks guard asynchronous completion.

Publication, publication-owned venue refresh, Contacts delivery retry, creation/clone and table/settings imports retain their separate existing workflows. They are not presented as ordinary-save recovery. Venue refresh has an actual browser regression for its existing lease/change/legacy-receipt path. The final 25-case shared-web program preserves the original 18 tests and adds seven groups for existing direct-result contracts and invalid/partial responses. These narrow compatibility checks do not claim new workflow parity.

## Server contract and durable outcomes

Receipt recovery opts into the existing POST `/receipt` route with `{operationId, versionId, recovery:true}`. Its fresh route authorization remains `deploy.read`; the original-operation check is same-owner, stricter than the legacy Admin receipt view. The verified response includes original result/state/receipt plus `bindingVerified`, service, school, actor, operation, version, action, business-intent digest, full-request digest and original/current fence. These binding fields follow result spreading so a stored result cannot replace them. Missing operations return unknown without fabricated binding proof.

POST `/operations/withdraw` takes a distinct stable control `operationId`, `targetOperationId`, `versionId`, `expectedDigest`, `expectedRequestDigest` and `expectedFence`. It requires fresh current `deploy.edit` authority, normal gateway origin/session/CSRF checks, and no impersonation. GET, another actor including another Admin, publication targets, wrong school/version/digest/fence and missing/malformed/unavailable historical evidence cannot authorise withdrawal. The control request creates no competing product-operation outcome: the target's durable receipt remains authoritative.

Deploy validates the stored operation's actor, school, action/authority action, decision ID, both digests and fence. Existing Core historical lookup supplies the original principal and descriptor; Deploy independently matches their actor/school/service/action/write/operation/resource/full-request digest. Historical evidence may be expired but intact. It establishes original binding only and never substitutes for current authorization. The descriptor stores neither the original body nor a command subtype: the endpoint is limited to same-owner, version-bound `deploy.edit`, while the UI exposes it only for retained ordinary saves. No narrower stored-subtype claim or payload reconstruction is made.

| Durable owner state | Recovery behavior |
| --- | --- |
| Committed with consistent receipt | Return the original committed result. Withdrawal cannot undo it or claim cancellation. |
| Aborted with consistent `terminal-not-committed` receipt | Return noncommit proof. The original fence is derived only from the validated terminal row; repeated checks do not advance it again. |
| Prepared | Keep unresolved until a real commit or owning-D1 abort wins. |
| Missing, malformed, mismatched or unavailable evidence | Keep unresolved; absence, age and HTTP status are not noncommit proof. |

Withdrawal calls the existing owning-D1 `abortOperation`, then rereads and checks its actual winner. An abort atomically advances the original operation fence and prevents the late writer; a racing commit returns its unchanged committed receipt. Admission resolution uses that actual outcome. Durable outcome and cross-owner evidence/pin resolution are separate steps: an interruption leaves recoverable pending resolution, never a claimed cross-D1 transaction. The real local race tests force both orderings and restart with persistent owner stores.

## Client retention, bounds and LORD preparation

One existing pending map is keyed by school/account/preview/service/operation. A save's lease preparation remains separate from the final request; lease success cannot settle the save. The final post-preparation body is frozen before dispatch, and explicit retry reuses its bytes and identity. Cross-endpoint cleanup requires matching context and owner digest or complete request binding. An unknown digest can settle only through a terminal response tied to that exact active request; an ID alone is insufficient. Direct lease/create/import/owner-result compatibility uses narrowly checked existing owner contracts, not generic HTTP 200 or `saved:true` acceptance.

The 128-slot bound includes a preparing save's reserved lease slot across awaits. Receipt reads remain available at capacity. Confirmed operations release only their own entries; unresolved entries and other domains' same-ID requests remain protected. Historical receipts cannot regress a newer version cache.

Deploy session storage holds at most 128 validated references in a protected-context key, with a 131,072-character read bound. References contain operation/version/context/digest/fence metadata, not save payloads, staff values or credentials. Reload can inspect the original operation or request verified withdrawal; it cannot reconstruct lost wire from current UI, revision or lease. Existing class-draft storage is preserved without expansion. Corrupt/unavailable storage is reported before claiming reload recoverability. A private in-memory proof can release only a caller-designated fresh local refusal before dispatch; absent or restored storage cannot establish that proof.

LORD native booking and the owned editor now reserve capacity, capture the original displayed group vector and prepare exact wire before persisting an uncertain attempt. An opaque handle binds the live entry, context, endpoint/action, operation and prepared wire. Only its fresh undispatched owner can release it after local preparation/persistence failure. Failed cleanup retains that exact live handle for cleanup-only retry; no replacement ID is invented. Reused/restored IDs remain uncertain until matching durable proof. Old raw-intent and enriched-owner digests remain distinct, and standalone physical-item retry remains supported without invented group selections.

The native LORD pending screen offers a read-only original-receipt check. Missing original group evidence cannot be rebuilt from refreshed inventory. Form values are captured before disabling controls; dialog/account/form changes prevent stale dispatch or draft restoration. A valid late response applies to a reopened editor only when the exact pending object and booking still match. The editor's fieldset and legend wrap complete IDs at 390px; physical collection/return behavior is unchanged.

## Actual verification at this checkpoint

All results here describe development working trees based on the local integration chain above. Implementation changes were still uncommitted; the client/editor and focused verification are now frozen. These results must not be reported as passes at `c77ede80…` or a future published implementation head. Commands use `TZ=Asia/Singapore`; browser commands also use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`.

| Executed command | Actual result and evidence |
| --- | --- |
| `node tests/v1-product-deploy-save-recovery.mjs` | 14/14 groups pass; elapsed 17.424s. `/tmp/gsis-deploy-save-recovery-final2.log`, timing in `…-final2-time.log`. |
| `node tests/v1-product-deploy-save-recovery-browser.mjs` | 15/15 groups pass with the frozen client: `/tmp/gsis-br01-native-frozen.log`. Earlier measured run 14.651s: `/tmp/gsis-br01-native-final-refresh.log`. |
| `node tests/v1-product-lord-cart-groups-browser.mjs` | 19/19 groups pass with the frozen client: `/tmp/gsis-br01-lord-frozen.log`. Earlier measured run 17.709s: `/tmp/gsis-b-r01-lord-browser-final-compat.log`. |
| `node tests/v1-product-deploy-fortnight-browser.mjs` | 6/6 groups pass; 6.44s, synthetic transport. `/tmp/gsis-br01-parent-fortnight-final.log`. |
| `node tests/v1-product-web.mjs` | 25/25 cases pass, retaining 18 existing cases and seven compatibility groups: `/tmp/gsis-br01-web-compatibility.log`. The earlier 18-case WebCrypto fixture run remains `/tmp/gsis-br01-web-regression-crypto.log`. |
| Existing regression programs, each invoked with `node tests/<file>` | Six Deploy/deployment programs and 12 Core/Contacts files pass; 56/56 Core/Contacts cases. `/tmp/gsis-deploy-save-recovery-regressions-corrected.log`. |
| `node scripts/v1/test.mjs --list`; `node tests/run.cjs --list` without shard filters | Final inventories contain 85 product and 1,184 Node programs. `/tmp/gsis-br01-product-discovery-final.json`, `/tmp/gsis-br01-node-discovery-final.json`; lists were checked for uniqueness, existing paths and inclusion of all five changed/new test programs. Discovery is not suite execution. |
| `npm run build` | Final canonical build passes all 18 production components with no tracked drift: `/tmp/gsis-br01-canonical-final.log`. No deployment. V1 product build verification remains pending. |

The six unchanged regression files are `v1-product-deployment.mjs`, `v1-product-deploy-storage.mjs`, `v1-product-deploy-venues.mjs`, `v1-product-deploy-clear-authority.mjs`, `v1-product-deploy-workbooks.mjs` and `v1-product-deploy-exports.mjs`. The 12 contract files are the five `v1-core-*.mjs` and seven `v1-contacts-*.mjs` programs. Deployment preflight used synthetic provider responses; storage tests identify synthetic Core/Venues adapters; export tests used synthetic Drive. No provider was contacted. The Core/Contacts cases retain their own later-integration limitations.

Service coverage includes real local Worker/Core/D1 transactions, both commit/abort orderings, lost commit/abort acknowledgement, current-permission revocation, historical expiry/unavailability, malformed receipt/binding negatives, original fence replay, actual Contacts admission pins and process restart. Browser coverage combines the actual built UI/client/local Worker stack with controlled transport failures for negative states. Fortnight transport is synthetic. A separate browser evidence run used `GSIS_WEB_EVIDENCE_DIR=/tmp/gsis-br01-ui-evidence`. Desktop and 390px images are at `/tmp/gsis-br01-ui-evidence/deploy-save-recovery-desktop.png` and `deploy-save-recovery-narrow.png`; inspected recovery controls remain in the existing save area, and notes remain in Versions rows. Publication evidence must preserve these artifacts or record their final artifact paths.

## Retained failure evidence

- Preliminary investigation: two stalled descriptor probes and an incorrectly seeded synthetic-session probe failed. A separate actual nine-Worker probe at frozen service `11370014…` subsequently passed in 10.226s (`TZ=Asia/Singapore GSIS_LOCAL_TRACE=1 timeout 55s node /tmp/gsis-b-r01-proof.mjs`, `/tmp/gsis-b-r01-proof.log`). That historical probe did not test the new withdrawal/UI implementation.
- Original Deploy behavior: `/tmp/gsis-br01-native-red.log` shows the unverified HTTP409 queue unlock. Server red evidence is `/tmp/gsis-deploy-save-recovery-red.log`.
- LORD failures: `/tmp/gsis-b-r01-lord-preflight-red.log` and `/tmp/gsis-b-r01-lord-narrow-red.log` record local preflight locking and overflow; intermediate browser logs retain dialog timing, disabled FormData and late-response defects. Final 19-group evidence is separate.
- Shared lifecycle findings: `/tmp/gsis-br01-client-lease-review.log` exposed confirmed lease entries leaking; direct-context and storage review logs retain the corresponding failures and corrected probes. The final 25-case shared-web run passes; full product/Node regression checks remain required.
- Regression invocation first failed on nonexistent `tests/v1-product-deploy.mjs` in `/tmp/gsis-deploy-save-recovery-regressions.log`. The corrected file inventory ran separately and passed.
- Fortnight's old fake lacked recovery/startup contracts (`/tmp/gsis-br01-parent-fortnight.log`). Its claimed test-only adaptation retains all six behavior groups. JSDOM lacked `crypto.subtle` (`/tmp/gsis-br01-web-regression.log`); path 11 supplies Node's real WebCrypto without an application fallback.
- Intermediate note/current-value and Save-status findings remain in `/tmp/gsis-br01-note-debug.log`, native green-5/green-6 logs and `/tmp/gsis-br01-parent-fortnight-debug.log`. A later reload timeout was corrected by selecting the actual original version after bootstrap; no assertion was skipped.

## Remaining gates and rollback

Pending: exact committed eleven-path inventory; V1 product build verification and final committed no-drift check; full 85-program product suite; required 1,184-program Node and LORD regression suites; exact-head CI; implementation PR with exact base/head; and Claude's independent review. Existing runners and their historical exclusions remain unchanged. Required command sequence includes `npm run build`, `node scripts/v1/build.mjs`, `node scripts/v1/verify-build.mjs`, `node scripts/v1/test.mjs` and `npm test`, under `TZ=Asia/Singapore`; a full local Node run has no shard filter; CI may instead prove complete coverage through all four existing shards and its aggregate. `npm test` includes the LORD Python runner. No focused pass or frozen-parent CI run satisfies these pending final-tree gates.

Q01 has the accepted claims and parent evidence. Q02–Q05 have source and passing focused-test evidence above; independent exact-head assessment is pending. Q06/Q07 remain pending full verification and review. Q08 is not applicable to deployment. Repository engineering principles were applied without adding dependencies or an authoritative browser store. No implementation skill execution is claimed; the documentation pass read and applied [Pstack `unslop`](skill://plugins_6a85a87df50c8191bd7f010bb7b17794/unslop/SKILL.md).

Rollback requires no schema/data migration and cannot undo a committed save or erase its receipt. Reverting restores the earlier recovery limitations. Missing historical evidence, unknown operations or lost full wire can still require unresolved recovery; the UI cannot make those outcomes safe by inventing a replacement. The separately queued venue `uses` preservation, initial canonical-register UI and Venues navigation fixes are outside this patch.

F5 remains **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. These tests do not establish the original hosted operation's outcome. No live receipt lookup, retry, withdrawal, Contacts acceptance write, migration, provider send, merge or deployment has been performed for B-R01.
