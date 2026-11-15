# Contacts classification roundtrip — RUN-B-023 handoff

Model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude at the published exact head. Updated 15 November 2026, 16:32 Asia/Singapore. **Implementation, eleven final owner/browser groups,26 unchanged regression programs and final local gates pass. Publication/full exact-head CI and Claude review remain pending.** No merge, deployment or live-data action is authorised by this handoff.

## Exact references and scope

| Record | Reference |
| --- | --- |
| Source report | [Run B at 4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd, RUN-B-023](https://github.com/helper-gsps/gsis/blob/4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd/docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md#L297) |
| Frozen implementation parent | [`f7f9ea2b0a6c7667e128a0752ad2c6f3551b91dd`](https://github.com/helper-gsps/gsis/commit/f7f9ea2b0a6c7667e128a0752ad2c6f3551b91dd), tree `3d9dcaab630f0439c46ea60e71c6a595a1e96840`, branch `codex/v1-contacts-projection`; local `709d0ae4b3ff78e12584dd26c266b98e93edf37f` has the same tree |
| Accepted claim | Main [`b3406e3359a9eebceaf772bcd5ef2a8c81d64dc3`](https://github.com/helper-gsps/gsis/commit/b3406e3359a9eebceaf772bcd5ef2a8c81d64dc3) |
| Incorporation before edits | Local `b2188da964322c05ad080c73ac749cb59ab404ba`; public [`bf891deda4d9ce05e32e3854ab29f53f3c8ab1a9`](https://github.com/helper-gsps/gsis/commit/bf891deda4d9ce05e32e3854ab29f53f3c8ab1a9); identical tree `a796372f7f6da76a1fdf4dc99a5a7fe3e08bdf44` |
| Branch / scope | `codex/v1-contacts-classification-roundtrip`; [accepted task and five-path allowlist](../../coordination/tasks/v1-contacts-classification-roundtrip.md) |
| Final implementation head / PR / CI | The implementation PR will record its exact head/base and checks; no self-referential implementation SHA is embedded here. Incorporation is not an implementation result. Child CI/review pending. |

The claim checkpoint refreshed 32 actual open-PR inventories. After frozen parent [PR173](https://github.com/helper-gsps/gsis/pull/173) opened, all 33 were refreshed: the preceding 32 were byte-identical and PR173 added only its 16 approved paths. Main, Run B and Claude's `claude/beautiful-dirac-uiflqu` at `58e22a7bf7ba4a49caa2caabe877605153b098db` were unchanged; no competing editor or new source finding appeared. ChatGPT explicitly permits this serial child after source freeze.

Parent [full CI43691932959](https://github.com/helper-gsps/gsis/actions/runs/43691932959) attempt2 is green at `f7f9ea2`: 1,190 Node programs and 40 LORD cases per shard/aggregate result. Attempt1's two program failures after approximately45s remain evidence, consistent with timeouts; their logs did not identify the signal/error and the cause is unproved. Both later passed locally under the same limit and the failed-job-only rerun passed without source/test timeout changes. Parent draft PR173's product91 CI and Claude review are pending. Parent results never count as this child's exact-head verification.

Only the classification overlay, v1 builder, one new browser test, task and this handoff may change. Contacts owner services/store/schema, Core grants/authority, admission, shared client, canonical v0.9 source, CI/configuration and generated outputs are outside scope. Preserve the complete Contacts A parent, including its orphan/history/notes display, Offload Staff tag correction, paging and eligibility boundaries.

## Failure and implemented behavior

The existing overlay serializes option references as catalogueId/revision/code, but stored references may have another object-key order. Both selection and submit compare JSON object strings. A mismatched or unavailable saved value appears unselected; all multi-select fields are then serialized, so an unrelated appointment edit or even no-edit Save can submit `subjectTags: []`. Current-only choices also omit assigned pinned/retired definitions. After a simulated commit only the lower staff form reloads, leaving native views stale. The disabled catalogue EO mapping repeats the serialization/unavailable-option problem.

Read-only evidence: five unchanged-overlay JSDOM counterexamples/controls in 0.324s; `/tmp/gsis-run-b023-classification-probe.mjs` and `.log`, probe SHA256 `cc73638ffc6d09efdd7fd5028792167eeb11bdbb8f3c1fedb8a9ab928d9ccda7`. The overlay source SHA256 is `017ce3e5d356179eabe0832d804023a6c7295649f7cb2f0624dfb2bed893a415`. API/session responses are synthetic: this proves rendering/submitted intent, not a durable owner mutation, actual Chromium or hosted outcome. The source report's record restoration is a separate actor's migration evidence; no real names or operation references are copied here.

The bounded repair implements these interfaces and preserves their ownership rules:

| Concern | Implemented contract |
| --- | --- |
| Reference identity / field intent | Compare exact typed catalogueId/revision/code, independent of key order. Retain original references and ordered arrays. Submit only genuinely dirty fields; restored original choices become clean. Explicit multi-value clear remains possible, while untouched/unavailable values cannot clear or repin. |
| Existing values | Render pinned/retired/unavailable or non-effective records honestly. Use code/revision when no label is available. Preserve disabled assigned EO mappings on unrelated definition edits. Do not add unsupported scalar clears, default accepted facts or new lookup definitions. |
| Person identity | Use qualified TTb labels with permanent IDs; do not merge homonyms or infer privileges. An authorised Contacts manager may edit their own ordinary classifications. The no-self-acceptance rule still applies to SMC/EO/School Leader acceptance, not ordinary classification edits. |
| Write and receipt | Existing Contacts owner validation, revisions and atomic audit/receipt remain authoritative. Preserve one immutable attempt/body through uncertainty; retries do not rebuild it from controls. Confirm matching operation/staff/result revision before clearing it or claiming Saved. |
| Native views | A narrow hook inside the built native Contacts module consumes one existing completed bootstrap response for directory and clean grid. It accepts identity/revision only, never replacement person data, and reuses native state/render helpers. No new endpoint, shadow store or canonical-source change. |
| Context and drafts | Recheck account/school/selected staff/form generation after awaits. Remove private overlay state on protected-state clear. Dirty/pending native and auxiliary drafts retain their exact baselines/edits/requests; a refresh cannot reset or resubmit them. |

View refresh has explicit `refreshed`, `deferred`, `stale` and `unavailable` outcomes. A confirmed write followed by failed refresh remains saved with an unavailable view, not an uncertain write. Matching selected-person row/directory revisions are required before a coherent-view claim. A newer revision permits at most one bounded lower-record/refetch reconciliation; otherwise show stale. No refresh triggers another write. This uses one owner response and does not claim atomicity across earlier/later reads or separate databases.

## Verification ledger

| Check | Status and evidence |
| --- | --- |
| Baseline canonical build | Pass: `TZ=Asia/Singapore npm run build`, 18 components/no tracked drift; `/tmp/gsis-classification-canonical-base.log`. Pre-implementation only. |
| New actual built-browser failing regression | Expected failure, exit1 in9.356s: real owner-created accepted Teacher reference displays `Not recorded` instead of `Same role label [Teacher]`. Actual nine local Workers/D1 and Chromium, synthetic identities/definitions. Command: `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-contacts-classification-browser.mjs`; log `/tmp/gsis-contacts-classification-red5.log`. The screenshot at `deliverables/v1/evidence/contacts-classification/classification-selection.png` was overwritten by later runs; only the log is retained as red-test evidence. Runtime disposed. |
| Intermediate owner/browser implementation verification | Eleven groups pass in21.586s (`/tmp/gsis-contacts-classification-green5.log`) and21.614s (`/tmp/gsis-contacts-classification-final.log`), using the same focused command above. Includes intended field-only writes, no-edit/no-write, retained and deliberately cleared values, disabled mapping, real persisted owner restart/original one effect and audit, draft/native-view races and capability/context boundaries. Identities and transport faults are synthetic. |
| Final corrected-source focused run | **Pass: 11/11 groups, exit0,22.458s**, below the unchanged45-second limit; `/tmp/gsis-contacts-classification-final2.log`, same focused command above. Actual stale catalogue CAS/durable abort and exact replay, wrong-operation terminal lock, matching-original unlock retaining the draft/mapping, blank Kind enabled after commit, malformed/duplicate bootstrap rejection and390px card/selector containment all pass. Both local Worker runtimes and browser disposed. |
| Peer corrections retained in the evidence trail | A0.809s synthetic JSDOM/API probe identified a disabled Kind on the blank new catalogue form after an existing-catalogue commit. The control-reset order was fixed. The21.614s intermediate run preceded terminal catalogue non-commit unlocking and narrow selector containment corrections; final2 verifies those changes. |
| Unchanged regressions | **Pass:26/26 programs**, all exit0 without timeout; maximum28.307s against the unchanged45-second bound. All26 files match parent `f7f9ea2` byte-for-byte and the three changed source hashes remained stable. `/tmp/gsis-classification-regressions.log`, `-results.json`, `-files.json`; selection and per-program command below. |
| Final bounded peer recheck | Four synthetic JSDOM catalogue cases pass in0.994s. Supplementary to real owner/browser tests; not Claude's independent review. |
| Final canonical/syntax/scope | **Pass:** `TZ=Asia/Singapore npm run build`,18 components/no tracked generated drift (`/tmp/gsis-classification-canonical-final.log`); `node --check` for overlay, builder and focused test; `git diff --check`; exact five-path inventory and unchanged tested source hashes. No production/configuration/generated change. |
| Test discovery | **Pass:** `TZ=Asia/Singapore node scripts/v1/test.mjs --list` finds92 product programs; `TZ=Asia/Singapore node tests/run.cjs --list` finds1,191 Node programs. Both discover the new browser test. JSON evidence: `/tmp/gsis-classification-{product,node}-list.json`. Full local suites were not rerun. |
| Exact-head Node/LORD/product CI; Claude review | Pending; no local full-suite or independent approval claimed. |

The new failure reaches the actual selection assertion; it does not claim that a later tag-clearing write was executed. Four earlier attempts had fixture navigation/locator/wait problems and are retained as `red`, `red2`, `red3`, `red4` logs; they are not product defects. The two allowed source paths were corrected under the accepted test-first workflow and the final focused run includes the peer fixes. Tested overlay SHA256 is `c37dbe12552ee85fddcd241bc252d419e4fd4974f718ea8b1133c6d084fb517f`, builder `8c53ea4a3619d803293cb2e95cbddcf41aa788a92fbf0714f9bb2e25784dc55c`. The new browser test SHA256 is `d44570641d1267c979aa9d16daf9c982172691a23bd3824f4cb4fccc148ff63e`. These hashes bind the local test; no final implementation commit is invented.

The focused test uses actual local owner mutations and D1 persistence with synthetic identities. Future and expired facts are owner-written; the pending-field presentation case is a response-only fixture because `/propose` creates a contribution rather than a pending field record. Delayed, unavailable, malformed and wrong-operation responses are explicit transport fault injections. They do not constitute live or hosted proof. Ignored final screenshots are `deliverables/v1/evidence/contacts-classification/classification-selection.png` (1440×1031) and `classification-narrow.png` (390×2772). The narrow capture includes retained drafts/unknown-operation test state; it proves card/selector containment, not that all existing controls are redesigned for mobile.

Q02–Q05 pass locally for the bounded implementation/focused matrix and final peer recheck. Q06 passes locally: focused/unchanged regressions and final canonical/syntax/discovery/scope/hash checks. Full1,191-program Node/LORD and92-program product exact-head CI remain pending. Q07 independent Claude review is pending.

All regression selections ran as `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/<program>` with a45-second per-program process limit. Exact26-program selection (brace notation expands the listed alternatives only):

```text
v1-product-contacts-{projection,projection-browser,save-recovery,recovery-browser,ui}.mjs
v1-product-core-contacts.mjs
v1-core-{authority,identity,isolation,races,session}.mjs
v1-contacts-{catalogues,contracts,core-provider,isolation,races,recovery,snapshots}.mjs
v1-product-web.mjs
v1-product-v09-frontend-parity.mjs
v1-product-web-{browser,load,workflows}.mjs
v1-product-deploy-save-recovery-browser.mjs
v1-product-roster-admin-settings-browser.mjs
v1-product-venues-navigation.mjs
```

This includes56 Core/Contacts contract cases and25 shared-web cases. The load regression uses30 synthetic signed-in browser contexts against200 local staff; it reports no errors, not production latency or runtime UAT. Full unchanged-source results remain in the log; none are inherited from the parent. The task owns the full acceptance list.

The two local Markdown links resolve. Reproduce that documentation check from the repository root (external links/CI are not validated by it):

```bash
python3 - <<'PY'
from pathlib import Path
import re
for name in ["docs/coordination/tasks/v1-contacts-classification-roundtrip.md", "docs/v1/contacts/CLASSIFICATION_ROUNDTRIP_HANDOFF.md"]:
    path = Path(name)
    for target in re.findall(r"\[[^]]*\]\(([^)]+)\)", path.read_text()):
        if "://" not in target and not target.startswith("#"):
            assert (path.parent / target.split("#")[0]).resolve().is_file(), target
print("Local documentation links pass")
PY
```

## Rollback and remaining work

This is a client/build correction without stored schema conversion. Retries retain an immutable attempt in the current page/session context; this change does not add reload/logout persistence or a durable client queue. Code rollback restores the faulty old UI and does not undo legitimate owner writes, audits or receipts; it is not permission to repair the reported school records. Contacts A's paired producer/consumer rollout constraint and inherited Roster rollback restrictions remain in force.

RUN-B-021 identity selection, RUN-B-024 signature/formal-role mappings, missing LT/Security/Music definitions and B catalogue-free authoring remain separate. Existing owner acceptance policy, Core grants, no notifications and school isolation are unchanged. F5 remains **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. Next: publish one bounded PR, record its exact implementation head/base and CI results, and request Claude's independent exact-head review. No merge or deployment.
