# v1-deploy-save-recovery: B-R01 ordinary save outcome recovery

- Status: implemented in the working tree; focused verification complete; full suites, publication and Claude exact-head review pending. No merge or deployment authorised.
- Owner/model: Codex; coordinator ChatGPT (v1); independent reviewer Claude.
- Last updated (Asia/Singapore): 15 November 2026, 12:54.
- Branch: `codex/v1-deploy-save-recovery`.
- Local integration HEAD: `c77ede80e2da411a8b20650d140aca8874deaa9a`. Implementation changes are uncommitted at this checkpoint; this is not an exact tested implementation SHA.
- Accepted initial claim: `5260b40c06f6a25652530c6a63db35048ec0a619`, following main `1db6b686b72a1bf54f0bc935982c2aed6cb4f560`.
- Tenth-path supplement: `2e62819640458b9b78438158d1785e570b88d346`; incorporated before editing that test at `e08d785e348307e95a5e85d7a9930746381eabeb`.
- Eleventh-path supplement: `b0266811578109327bb3a51d60d1267647a4ba79`; incorporated before editing that test at current local HEAD above. Both original supplement records are preserved below.
- User scope: the supplied frontend UAT repair queue, one bounded group at a time. Historical permissions in source documents do not authorise live operations.

## Exact eleven-path scope

1. `v1/services/deploy/service.mjs`
2. `v1/web/shared/client.js`
3. `scripts/v1/build-web.mjs`
4. `tests/v1-product-deploy-save-recovery.mjs`
5. `tests/v1-product-deploy-save-recovery-browser.mjs`
6. `docs/coordination/tasks/v1-deploy-save-recovery.md`
7. `docs/v1/accelerated-delivery/DEPLOY_SAVE_RECOVERY_FIX_2026-11-15.md`
8. `v1/web/shared/lord-user.js`
9. `tests/v1-product-lord-cart-groups-browser.mjs`
10. `tests/v1-product-deploy-fortnight-browser.mjs`
11. `tests/v1-product-web.mjs`

Deploy owns saved documents, operation outcomes and withdrawal. Core retains current authorization and historical decision evidence. The shared client owns bounded transient request retention and minimal recovery references. The builder changes v1 adaptations of the reused Deploy and LORD UIs; LORD retains cart, reservation, custody and outcome ownership. Shared-client compatibility with other owners uses their existing response contracts, covered by the final 25-case web program. No backend Calendar, LORD service/model, Core/shared-runtime implementation, v0.9 source, schema, migration, dependency, provider, configuration, secret or tracked generated output changes belong here.

## Claim and frozen-parent handoff

The start-gate refresh read root/v1 instructions, workflow, lanes, directives, status, deployments and engineering policy; fetched all heads and inspected all 26 then-open PR file inventories. Main was `1db6b686b72a1bf54f0bc935982c2aed6cb4f560`, Run B `e0ee789854623b6088a5dadf0f14c9e8291501ec`, and Claude's review branch `58e22a7bf7ba4a49caa2caabe877605153b098db`. PRs #160/#164 overlapped the service; #161/#163/#165/#166 overlapped the builder. These were frozen same-builder predecessors, with no external competing implementer identified. Production coordination remains unchanged.

The frozen service parent is `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9` (`codex/v1-deploy-clear-authority`, PR #164), including publication recovery `ab24739203f3bcc03c5b7e6c96f8fa2144a84654` (PR #160). The builder/client/LORD parent is `af6065e30c667b453f72b27ffbdec742ceaac92f` (`codex/v1-lord-cart-groups`, PR #167), containing ASC `5a2affa6a99ac4511644d0b3e01bcae827774dae`, Fortnight `38dabe6ad46a5f0fdf37baa92811ffca86206cf7`, Contacts recovery `175f34e55cc3152a60ef0a6865c3bcfb55ab27c5` and saved-draft UI `1f4121a6b54de6f9973934992fea395fdc3cab81`.

Both chains were combined at local merge `491327f492df0200a359aa841dc92dcb8ade22f6`. The accepted initial claim was incorporated before implementation at `44aa8519ac549b62cca2d35971d05d561cc085e2` (tree `c64b602a6c633731b4e3d78c8d4e995ff4bd8908`). The two later test supplements were incorporated in sequence as recorded above. Public equivalent merges prepared for publication are `ee00e9c70d83eb17a6da33065341ca50e94e40ed` for the combined parents, `16b37c21b723a996a3893c54b2af2f9d4fa635c1` for the initial claim, `bf54b33be7144ed454798feaac9f4a869f029a10` for the tenth path and `6cb5adcb2909177f7f2a1ecf1add252d2c8e8993` for the eleventh. These are equivalent integration history, not implementation test results. The publication refresh inspected all 27 open PR file inventories with no external overlap; main remained `b0266811578109327bb3a51d60d1267647a4ba79`. Run B advanced to prefix `9b6b936`; its new findings remain separate follow-up work. Frozen predecessor branches were not edited. Any later parent change needs child revalidation and updated review.

## Implemented behavior

The [implementation handoff](../../v1/accelerated-delivery/DEPLOY_SAVE_RECOVERY_FIX_2026-11-15.md) records the contracts, covered callers, commands and limitations.

- Deploy queued edits, direct editors and version notes retain the original save through uncertain outcomes. Check reads only; explicit retry sends retained final wire; Stop original save requests server-verified withdrawal. HTTP status alone never clears an unresolved attempt. Historical note receipts trigger a current owner read instead of overwriting a later note.
- The client freezes the complete post-preparation request, separates its lease identity, and settles only the matching school/account/preview/service/operation with the appropriate owner evidence. Old receipt results cannot regress cached revisions. A bounded minimal session reference supports reload inspection, not reconstruction of a lost payload. Receipt reads remain available at capacity.
- Deploy recovery opts into the existing receipt route with `recovery:true`. Same-owner POST `/operations/withdraw` requires current edit permission plus the original historical request/resource binding and expected digests/fence. Owning-D1 abort reports the actual commit/abort winner; late original writers remain fenced. Admission resolution remains a separate recoverable step, not a cross-D1 transaction.
- LORD native creation and the owned editor prepare and freeze group evidence before persisting pending state. Only the exact fresh, live, undispatched preparation may be released locally after failure. Reused/restored identities remain uncertain. Dialog/account/form changes fence late work. The owned editor wraps full IDs at 390px without changing physical custody behavior.
- The Fortnight fixture now models verified recovery without weakening its six behavior groups. The shared-web fixture uses real Node WebCrypto and passes all 25 cases, preserving the original 18 and adding seven owner-contract compatibility groups.

## Acceptance evidence and remaining gates

Focused results below are working-tree development evidence, not passes at a published implementation SHA. All commands use `TZ=Asia/Singapore`; browser programs use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`.

| Check | Actual result at this checkpoint |
| --- | --- |
| `node tests/v1-product-deploy-save-recovery.mjs` | 14/14 groups pass: lost response, binding/security negatives, both real D1 race orders, late fence, admission interruption and restart. `/tmp/gsis-deploy-save-recovery-final2.log`. |
| `node tests/v1-product-deploy-save-recovery-browser.mjs` | 15/15 groups pass with the frozen client in `/tmp/gsis-br01-native-frozen.log`; earlier measured run 14.651s in `/tmp/gsis-br01-native-final-refresh.log`. Covers native queue, note/direct editors, reload, capacity, context changes and publication-owned venue-refresh compatibility. |
| `node tests/v1-product-lord-cart-groups-browser.mjs` | 19/19 groups pass with the frozen client in `/tmp/gsis-br01-lord-frozen.log`; earlier measured run 17.709s in `/tmp/gsis-b-r01-lord-browser-final-compat.log`. Includes real local create/edit, storage, exact-wire, pending cleanup and narrow UI cases. |
| `node tests/v1-product-deploy-fortnight-browser.mjs` | 6/6 groups pass with synthetic transport, 6.44s. `/tmp/gsis-br01-parent-fortnight-final.log`. |
| `node tests/v1-product-web.mjs` | 25/25 cases pass, retaining the existing 18 plus seven direct-result/negative compatibility groups. `/tmp/gsis-br01-web-compatibility.log`; earlier 18-case result retained in `/tmp/gsis-br01-web-regression-crypto.log`. |
| Six existing Deploy/deployment programs; five Core and seven Contacts contract programs | Pass; Core/Contacts 56/56 cases. Exact file list and limitations in handoff; `/tmp/gsis-deploy-save-recovery-regressions-corrected.log`. |
| Existing runner discovery | Final lists contain 85 product and 1,184 Node programs, including both new recovery programs and changed existing tests: `/tmp/gsis-br01-product-discovery-final.json`, `/tmp/gsis-br01-node-discovery-final.json`. Lists were checked for uniqueness and existing files. This is discovery, not suite execution. |
| Canonical/build parity and eleven-path diff | Final `npm run build` passes all 18 components with no tracked drift: `/tmp/gsis-br01-canonical-final.log`. V1 product build verification and final committed inventory pending. |
| Full product, required Node/LORD, exact-head CI and Claude review | Pending. No parent CI or focused test result substitutes for these gates. |

Q01 **Pass** for the recorded accepted claims and serial parent handoff; refresh again before publication. Q02–Q05 have implementation/source and passing focused-test evidence in the handoff; independent exact-head assessment remains **Pending**. Q06 **Pending** full verification. Q07 **Pending** PR/exact-head handoff and Claude review. Q08 **Not applicable** to deployment; no deployment is authorised. Engineering-policy ownership, bounded-state, recovery and evidence principles were applied; no implementation skill execution is claimed. The documentation pass read and applied [Pstack `unslop`](skill://plugins_6a85a87df50c8191bd7f010bb7b17794/unslop/SKILL.md); it grants no task or release authority.

## Failure history, limits and next action

Earlier failures remain recorded: two stalled descriptor probes; a failed synthetic-session fixture; the initial native HTTP409 unlock; LORD preparation/persistence and narrow-layout failures; an incorrect nonexistent regression filename; the Fortnight incomplete transport fixture; missing WebCrypto in JSDOM; and intermediate receipt/context/cache defects. Their specific logs and corrected runs are indexed in the handoff. Later passes do not turn those attempts into passes.

Publish the frozen bounded implementation, then record the actual head/base, changed files, build/no-drift evidence, full suites and CI. Claude reviews that exact head without editing the branch. No merge, deployment, original hosted receipt lookup/retry/withdrawal, Contacts write, migration or provider send is implied.

Rollback needs no schema/data migration and cannot undo a committed save. Reverting restores earlier recovery limitations; original identities and durable receipts remain authoritative. Unknown or missing original evidence can remain unresolved. The separately identified venue `uses` preservation and Venues navigation/register follow-ups are outside B-R01. F5 remains **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.

## Coordinator scope supplement — 15 November 2026, 12:16 SGT

Actual parent regression `tests/v1-product-deploy-fortnight-browser.mjs` now fails at `finishSave` because its synthetic GSISV1 only supplies capable/fetch and has no verified recovery/reference API or startup reconciliation response. Evidence: `/tmp/gsis-br01-parent-fortnight.log`; its first behavior group passes, then the incomplete fake times out. The new actual-client/native Deploy test already passes eight groups at this stage, but that does not waive the parent regression.

The v1 coordinator authorises one additional test path, number10 above, to adapt that existing fake to the new verified-recovery contract. Retain all six behavior assertions, raw-input/blur/queue semantics and uncertainty checks. Do not add a production compatibility fallback, skip tests or treat an unverified HTTP result as terminal merely to satisfy the old fake. No other file or business scope expands. Record this claim-only supplement on main with expected-head protection, immediately incorporate it into the implementation branch, and only then edit the tenth path. Claude reviews the exact resulting implementation head.


## Coordinator platform-fixture supplement — 15 November 2026, 12:40 SGT

The unchanged `TZ=Asia/Singapore node tests/v1-product-web.mjs` regression fails before its assertions because its JSDOM fixture has no WebCrypto SubtleCrypto (`TypeError` at `crypto.subtle.digest`); evidence `/tmp/gsis-br01-web-regression.log`. Real HTTPS browser tests already exercise the required digest operation. The coordinator adds only the existing test path11 above to provide Node's real WebCrypto and text encoders in that fixture, retain its18 existing cases and add bounded shared-client compatibility negatives where needed. Do not add an application crypto fallback or weaken receipt hashes.

This test also verifies preservation of existing owner response contracts where shared pending cleanup changes: a direct successful preparation/create/import result must not leak a slot; unknown/partial/mismatched evidence still cannot settle another request. Production changes stay in the already claimed client path and must be grounded in actual owner finish/receipt contracts. No provider, dependency, schema, authority or new module feature is added. Publish this claim-only supplement and incorporate it before editing path11. The earlier ten-path supplement and its failure evidence remain history.
