# B-V01c: preserve saved venue uses during metadata refresh

Model: Codex. The accepted claim is incorporated and the 17-line source repair is implemented. Focused verification is complete; full suites through exact-head CI and independent review remain pending. This handoff records the source contract and actual working-tree evidence, without claiming a published tested implementation SHA. See the [task record](../../coordination/tasks/v1-deploy-venue-uses.md). No live operation is authorised.

## Frozen source and scope

- Selected implementation parent: [`ecaa37e87bc34ba85b8d3649184b0279e973539d`](https://github.com/helper-gsps/gsis/commit/ecaa37e87bc34ba85b8d3649184b0279e973539d), `codex/v1-deploy-save-recovery`.
- Pre-claim main: `b0266811578109327bb3a51d60d1267647a4ba79`. Accepted claim: [`68f0504f408a52b00d1d0cd625f21a3ea87c76f2`](https://github.com/helper-gsps/gsis/commit/68f0504f408a52b00d1d0cd625f21a3ea87c76f2).
- Parent PR: [#168](https://github.com/helper-gsps/gsis/pull/168), draft at the frozen head above. Its full CI [`43678891012`](https://github.com/helper-gsps/gsis/actions/runs/43678891012) is green: 1,184 Node programs and 40 LORD programs in each shard. Clean local product verification passes 85/85. Parent PR product/build CI and Claude review remain pending. These results do not count as B-V01c verification.
- Latest read Run B: [`9b6b9361a42de0e54153e7a0a63d719150ac2392`](https://github.com/helper-gsps/gsis/commit/9b6b9361a42de0e54153e7a0a63d719150ac2392), `docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md` on `codex/v1-uat-run-b-20261115`.
- Branch: `codex/v1-deploy-venue-uses`. Claim incorporated before edits at `d4b2ebacc6cc7a66f59291cb60795e74be121761`, tree `8d4f20ee1a70c606623f00ec51953fc94dc387c1`. Public equivalent preimplementation merge `e8de600a00ca0f682c49092b7b69a229703c2300` has that same tree. These are preimplementation bases, not tested implementation heads. Final head and PR: pending.

The parent preserves Deploy #160 `ab24739203f3bcc03c5b7e6c96f8fa2144a84654` and #164 `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9`, LORD #167 `af6065e30c667b453f72b27ffbdec742ceaac92f`, ASC `5a2affa6a99ac4511644d0b3e01bcae827774dae`, Fortnight `38dabe6ad46a5f0fdf37baa92811ffca86206cf7`, Contacts `175f34e55cc3152a60ef0a6865c3bcfb55ab27c5`, saved drafts `1f4121a6b54de6f9973934992fea395fdc3cab81`, and B-R01's three accepted claim commits. Read-only ancestry checks passed. The expected-head claim update and its incorporation are complete. The 13:09 SGT refresh found only frozen same-builder overlaps in all 28 open-PR file inventories; Claude review branch was `58e22a7bf7ba4a49caa2caabe877605153b098db`. Predecessor branches remain frozen. The 41-ID queue is in PR #159 at `ed00030e0d237005cf484ef0f8630b54d93e04e3`; its other findings are not added to this task.

Exact four paths:

1. `v1/services/deploy/service.mjs`
2. `tests/v1-product-deploy-venues.mjs`
3. `docs/coordination/tasks/v1-deploy-venue-uses.md`
4. `docs/v1/accelerated-delivery/DEPLOY_VENUE_USES_FIX_2026-11-15.md`

Deploy owns saved planning metadata; Venues owns canonical identity and physical metadata. No browser, schema, Core, shared-runtime or publication/source-pin change is included.

## Evidence and meaning

At the selected parent, `v1/services/deploy/service.mjs:1225–1285` reconstructs canonical rooms and preserves only prior form/form-array assignments. The omission is at the returned row, lines 1261–1273. `usedVenueIds()` at lines 1202–1211 selects class/TG/form references and must remain unchanged. Existing Worker test lines 168–179 assert form/forms retention; its later restart boundary can also verify uses without another runtime or framework.

Historical source at `5260b40c06f6a25652530c6a63db35048ec0a619` explains the field:

| Source | Finding |
| --- | --- |
| `backend/Seed.gs:2` | 143 arrays: 91 empty, 52 nonempty, 106 total string labels. Observed maxima of three elements/twelve characters are sample facts, not limits or live inventory. |
| `layout-update/public/landmark.html:114` | Legacy display divides labels into homeroom-looking and teaching text. |
| `layout-update/public/landmark.html:2974–2990` | Current integration clears legacy uses and fills allocations from validated source data. |
| `backend/Code.gs:793` | Older metadata refresh adds missing rooms without reconstructing existing room objects, so their uses survives. |
| `backend/Code.gs:938–941`; `shared/layout-data.js:42–69` | Current allocation uses form/forms and explicit TG relationships, not uses. |

V1 generic JSON storage preserves own property presence and values; no dedicated uses schema exists. Generic depth/string/array and atomic delta bounds remain authoritative. Preserve this compatibility field without inferring occupancy, allocation or role authority.

The earlier exact-function source probe reproduced loss of uses from two synthetic rooms while preserving form/forms and leaving input unchanged. Evidence: `/tmp/gsis-discovery-pr167/source-probes.mjs` and `.log`, command `TZ=Asia/Singapore node /tmp/gsis-discovery-pr167/source-probes.mjs`. That probe used PR160 source, not the future fix, and is not durable Worker/restart evidence. Run B reports hosted loss and a separately authorised data restoration. This task does not repeat or validate those live actions.

## Implemented repair contract

The service adds 17 lines inside `refreshedVenues()`. For the same exact stable ID it clones `uses` only when it is an own property, without trimming, sorting, deduplicating, interpreting or defaulting it. Canonical physical fields still refresh. New IDs get no inherited uses even if their display name matches.

| Old own-property value | Same canonical ID remains | Old ID omitted and no current references |
| --- | --- | --- |
| Absent | Keep absent | Existing removal behavior |
| JSON `null` | Keep null | Existing removal behavior |
| `[]` | Clone empty array | Existing removal behavior |
| Nonempty array | Clone exact order/content | Refuse refresh |
| Other bounded JSON, including `false`, `0`, `""` and `{}` | Clone exact value | Refuse refresh |

Only absent/null/empty array are known-empty for the refresh-local deletion guard. Unknown non-null JSON must not disappear because it is false-like. Keep current class/TG/form reference protection independently. A refusal uses `VENUE_REFERENCE_CHANGED`, leaves the version/planning data unchanged and asks the user to review retained metadata. It does not supply an automatic repair or fabricate a canonical room.

`usedVenueIds()` and `referenceVenues()` are unchanged; publication dependency selection, revision requirements and source pins keep their existing behavior. Preventing refresh data loss gives legacy labels no current operational meaning. Do not impose limits copied from historical sample maxima or weaken current generic JSON/delta bounds.

## Verified focused acceptance coverage

The existing venue Worker/D1 program passes all 11 groups in 16.791s: the original eight groups plus three new groups. It reuses one runtime/restart and a nine-value table. Its final file SHA-256 is `aad436a727339882276a4028ea921d95e710a69e147fdc2bfe231d0e11b252cc`.

- Red before repair: actual refresh dropped nonempty uses while form/forms survived.
- Same-ID refresh retains absent/null/empty/nonempty and unknown JSON representations, canonical metadata updates, and unrelated planning data remains exact. No whole-row spread copies unrelated unknown fields; the input snapshot stays unchanged.
- Missing IDs with nonempty/unknown values reject atomically, including false-like JSON. Absent/null/empty-array values retain existing otherwise-unreferenced removal behavior. Class/TG/form references independently block removal. Same-name/new-ID rows do not receive old metadata.
- A uses-only room adds no publication reference or source fence. Existing bounds, authority and revision regressions remain unchanged.
- Lost reply and exact replay retain the original saved data/revision and receipt after catalogue changes; changed intent returns 409. The existing restart verifies durable value/property-presence and original receipt recovery.

The final focused log is `/tmp/gsis-venue-uses-final.log`. No browser behavior changed; this saved-field repair uses actual service/storage evidence rather than adding a browser test or validation framework. Full suites remain required in CI.

## Actual working-tree verification

These checks ran on development working trees based on the accepted integration above. They are not passes at a committed implementation SHA. Runtime commands use `TZ=Asia/Singapore`.

| Command/check | Result |
| --- | --- |
| `npm run build` | Baseline and final working-tree builds pass: 18 production components, no tracked drift. `/tmp/gsis-venue-uses-canonical-base.log`, `/tmp/gsis-venue-uses-canonical-final.log`. |
| `node tests/v1-product-deploy-venues.mjs` with the red uses assertion before source repair | Expected failure: seven groups passed, one failed because uses was undefined instead of the ordered duplicate-label array. Elapsed 15.536s; `/tmp/gsis-venue-uses-red-actual.log`. |
| Final `node tests/v1-product-deploy-venues.mjs` | Pass, 11/11 groups in 16.791s. `/tmp/gsis-venue-uses-final.log`. |
| `node tests/v1-product-deploy-storage.mjs` | Pass; storage coverage includes synthetic Core/Venues dependency adapters. |
| `node tests/v1-product-deploy-clear-authority.mjs` | Pass, all 12 groups, including actual D1 races. |
| `node tests/v1-product-deploy-save-recovery.mjs` | Pass, all 14 groups, including original-outcome races and restart. |
| `node tests/v1-product-deploy-workbooks.mjs` | Pass. |
| Each of the five `tests/v1-core-*.mjs` and seven `tests/v1-contacts-*.mjs` programs | Pass, 56/56 cases. Their existing integration/F5 limitations remain. |
| Service/test `node --check`, existing Prettier check and scoped whitespace check | Pass. No formatter dependency added. |
| `node scripts/v1/test.mjs --list`; `node tests/run.cjs --list` | 85 product and 1,184 Node programs discovered, unique entries. `/tmp/gsis-venue-uses-product-list.json`, `/tmp/gsis-venue-uses-node-list.json`. |
| Working-tree changed-file inventory | Exactly the four claimed paths. No tracked build drift. Final committed inventory belongs in the PR. |

All 16 unchanged regression programs completed with process exit 0; combined log `/tmp/gsis-venue-uses-regressions.log`. The first red-test wrapper attempted unavailable `/usr/bin/time` and exited 127 before executing the test; `/tmp/gsis-venue-uses-red.log` preserves that failure. The later shell-timed red run is separate evidence, not a relabelled pass.

## Remaining gates and limitations

Claim acceptance/incorporation, source repair, focused tests, canonical build/no-drift, working-tree four-path inventory and discovery are complete. PR publication, final committed inventory, full product/build CI, full Node/LORD CI and Claude exact-head review remain pending. The coordinator will run the full 85-program product suite in PR CI and 1,184 Node/LORD through full CI; no separate child local full-suite execution is claimed. The 17-line service change remained unchanged through the focused and regression runs. Root refreshes overlapping PRs/reviews before publication. A parent code change invalidates the selected frozen-base assumption and requires revalidation. No parent green check can substitute for child exact-head evidence.

No automatic restoration of values lost by an older refresh. Rollback needs no schema migration and affects future refreshes only. Do not backfill from generic seed data. Initial Venues register UI, routing, Run B pending publication and Calendar findings are separate tasks.

F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested. No live receipt lookup/retry, data write, migration, provider action, merge or deployment is authorised by this task.
