# v1-deploy-venue-uses: B-V01c preserve saved room-use metadata

- Status: implementation and focused verification complete; full suites through exact-head CI, publication and Claude review pending. No merge or deployment authorised.
- Owner/model: Codex; coordinator ChatGPT for v1; independent exact-head reviewer Claude.
- Last updated: 15 November 2026, 13:18 SGT.
- Branch: `codex/v1-deploy-venue-uses`.
- Selected frozen parent: `ecaa37e87bc34ba85b8d3649184b0279e973539d`, branch `codex/v1-deploy-save-recovery`. PR #168 is open at that frozen head. Full CI `43678891012` is green: 1,184 Node programs and 40 LORD programs in every shard; clean local product passes 85/85. PR product/build CI and Claude review remain pending. No parent source edits continue during this handoff.
- Pre-claim main: `b0266811578109327bb3a51d60d1267647a4ba79`; the non-force claim update was accepted at `68f0504f408a52b00d1d0cd625f21a3ea87c76f2`.
- Run B source: `9b6b9361a42de0e54153e7a0a63d719150ac2392`, `docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md` on `codex/v1-uat-run-b-20261115`.
- Accepted claim: `68f0504f408a52b00d1d0cd625f21a3ea87c76f2`. Incorporated before implementation at `d4b2ebacc6cc7a66f59291cb60795e74be121761`, tree `8d4f20ee1a70c606623f00ec51953fc94dc387c1`. Final implementation head and PR: pending.
- Authorisation: next bounded repair in the continuing owner-authorised frontend UAT queue, selected by ChatGPT as v1 coordinator. The accepted Git claim is required before implementation; no live action is authorised.

## Exact four-path scope

1. `v1/services/deploy/service.mjs`
2. `tests/v1-product-deploy-venues.mjs`
3. `docs/coordination/tasks/v1-deploy-venue-uses.md`
4. `docs/v1/accelerated-delivery/DEPLOY_VENUE_USES_FIX_2026-11-15.md`

Deploy owns the saved version's planning compatibility metadata and refresh outcome. Venues owns canonical room identity and current physical metadata/revisions. No browser, builder, Core, Contacts, shared-runtime, schema, dependency, provider, v0.9 source, tracked generated-output or configuration changes. Do not change `usedVenueIds()`, publication reference selection or source-pin semantics. No merge, deployment, migration, canonical room seeding, Contacts acceptance write or live-data access.

## Refreshed overlap and claim-first sequencing

At 13:09 SGT all heads, main, Run B, Claude review branch and all 28 actual open-PR inventories were refreshed. Run B remains `9b6b9361a42de0e54153e7a0a63d719150ac2392`; Claude review branch remains `58e22a7bf7ba4a49caa2caabe877605153b098db`. Only frozen same-builder PRs #160/#164/#168 overlap this service/test scope. No competing implementer was found. The B-R01 source is frozen and handed forward; its pending review/build checks are not claimed complete. Root/v1 instructions and applicable coordination/engineering records were read. The 41-ID discovery queue is published in PR #159 at `ed00030e0d237005cf484ef0f8630b54d93e04e3`.

## Preserved parent and incorporation

The refresh and read recorded above established the same-builder serial handoff. B-R01 PR #168 is frozen at `ecaa37e87bc34ba85b8d3649184b0279e973539d`. Its full CI and clean local product results are parent evidence only; its PR product/build CI and Claude review remain pending at this checkpoint. No B-R01 or predecessor branch is being edited.

The selected parent already contains PR #160 publication recovery `ab24739203f3bcc03c5b7e6c96f8fa2144a84654`, PR #164 clear-authority guards `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9`, LORD #167 `af6065e30c667b453f72b27ffbdec742ceaac92f`, and the ASC/Fortnight/Contacts/saved-draft chain. It also includes B-R01 claims `5260b40c06f6a25652530c6a63db35048ec0a619`, `2e62819640458b9b78438158d1785e570b88d346` and `b0266811578109327bb3a51d60d1267647a4ba79`. These ancestry relationships were checked read-only. Parent verification is not child verification.

The coordinator published only this task claim on main, re-read the accepted record, and incorporated it into the frozen parent before implementation. The exact claim/base/tree are recorded above and were verified locally. Public preimplementation merge `e8de600a00ca0f682c49092b7b69a229703c2300` has the same tree `8d4f20ee1a70c606623f00ec51953fc94dc387c1` as local `d4b2ebacc6cc7a66f59291cb60795e74be121761`; neither is a tested implementation head. Refresh actual overlaps again before publication. A changed parent or new overlap requires coordinator reassessment and child revalidation; do not overwrite or omit predecessor fixes.

## Defect and smallest repair

At the selected parent, `refreshedVenues()` reconstructs each room from canonical id/name/unit/shortName/revision and retains prior Deploy `form`/`forms`; it drops prior `uses`. Existing venue tests cover form/form-array retention but have no uses fixture. Run B reports the corresponding hosted loss and separately authorised migration recovery. Those historical actions grant no permission to repeat live reads or repairs.

Preserve an own `uses` property for the same exact stable room ID by cloning its stored JSON value. Keep absent distinct from `null` and `[]`; retain order, duplicate labels and unknown bounded JSON without coercion. Never infer room identity from a name/alias, copy the entire prior row, or invent uses for a new canonical room. Canonical physical fields must still refresh from the verified Venues catalogue.

`uses` is planning compatibility metadata. It does not establish occupancy, allocation, authority or a publication dependency. Existing readers derive current allocation from class/TG/form/form-array references. Keep `usedVenueIds()` and all publication/source-pin behavior unchanged.

For an old room omitted from the catalogue, preserve the existing current-reference rejection. Add only a refresh-local retained-data guard:

- No own `uses`, explicit JSON `null`, and an empty array are the only uses states that permit the existing otherwise-unreferenced removal behavior.
- Every other own JSON value blocks removal, including a nonempty array, object, nonempty string, empty string, `false` and `0`. Do not use truthiness or a generic nullish/default conversion to discard unknown data.
- Return the existing `VENUE_REFERENCE_CHANGED` failure family with a message to review the saved room-use metadata. Do not claim an automatic repair, restore a missing canonical room or save a partial catalogue.

The distinction is deliberate: JSON null remains null on a matching ID and is an explicit empty value for removal; unknown non-null content remains protected even when JavaScript considers it false. Retention does not validate or assign operational meaning to legacy metadata.

Keep existing generic JSON validation and document/delta bounds. Historical seed maxima are sample data, not new uses-specific limits. No new schema, helper framework, cache, browser flow or publication protocol is needed.

## Proportionate acceptance tests

The existing actual local Worker/D1 program now passes 11 groups, retaining all eight original groups and adding three groups with a nine-value table. It reuses the school, catalogue, revision/lease helpers and one restart. The following acceptance requirements are covered by `/tmp/gsis-venue-uses-final.log`:

1. First reproduce omission with a same-ID room containing form/forms and nonempty uses. After repair, current canonical label/revision changes, uses/form/forms stay exact, unrelated planning data stays unchanged, and the input snapshot is not mutated.
2. Cover own-property absence, `null`, `[]`, ordered/duplicate label arrays and bounded unknown JSON. Include `false`, `0`, an empty string and an object so no truthiness guard can silently lose them. No sample-derived three-item/twelve-character cap. These are retention cases, not new allocations.
3. Table-test missing canonical IDs. Nonempty or unknown non-null content rejects the entire refresh with no planning-row/version delta. Otherwise-unreferenced absent/null/empty-array records retain existing removal behavior. Existing class/TG/form references still reject independently. A new ID with the same display name cannot inherit the old value.
4. Inspect the existing publication reference/pin evidence with a uses-only room and prove it has no new dependency. Preserve existing canonical source validation, stale-version, lease/permission and atomic-failure coverage. Existing generic size/JSON limits remain unchanged; reuse their regression coverage rather than adding a second exhaustive bounds suite.
5. Lose the successful refresh reply, then retry the exact original operation after catalogue metadata changes. It returns the original receipt and unchanged saved revision/uses, without incorporating the later catalogue. A changed-intent retry conflicts. Extend the existing process restart assertion to check the saved uses value/property presence and original receipt from durable D1.

Use synthetic records and controlled faults only. A new browser test is unnecessary for a service-only saved-field repair. Do not inspect or retry the owner's hosted operation.

## Verification, handoff and rollback

The source change adds 17 lines to `refreshedVenues()`: same-ID own-property cloning and a refresh-local retained-data guard. `usedVenueIds()` and `referenceVenues()` are unchanged. The [handoff](../../v1/accelerated-delivery/DEPLOY_VENUE_USES_FIX_2026-11-15.md) records the commands and evidence. These are working-tree results, not a published exact-head pass.

| Check | Actual status |
| --- | --- |
| `TZ=Asia/Singapore npm run build` | Baseline and final working-tree builds pass, all 18 components; no tracked drift. `/tmp/gsis-venue-uses-canonical-base.log`, `/tmp/gsis-venue-uses-canonical-final.log`. |
| Red focused venue run before source repair | Seven groups passed, one failed on missing uses; elapsed 15.536s. `/tmp/gsis-venue-uses-red-actual.log`. The preceding `/usr/bin/time` invocation failed before tests with exit 127 because that binary was absent; `/tmp/gsis-venue-uses-red.log`. |
| Four unchanged Deploy programs plus 12 Core/Contacts files | Pass, process exit 0; 56/56 Core/Contacts cases. `/tmp/gsis-venue-uses-regressions.log`. |
| Service syntax, Prettier and scoped whitespace | Pass for the current source change. |
| `TZ=Asia/Singapore node tests/v1-product-deploy-venues.mjs` | 11/11 actual Worker/D1 groups pass in 16.791s, preserving all eight original groups. `/tmp/gsis-venue-uses-final.log`. |
| Four-path scope and existing runner discovery | Pass: exact claimed inventory, 85 product and 1,184 Node programs; `/tmp/gsis-venue-uses-product-list.json`, `/tmp/gsis-venue-uses-node-list.json`. Discovery is not full execution. |
| Full product/Node/LORD, exact-head CI, PR and Claude review | Pending. The 85-product suite will run through PR CI and 1,184 Node/LORD through full CI. No child local full-suite run is claimed. |

All runtime checks use `TZ=Asia/Singapore`. Preserve existing assertions, runner limits and historical exclusions; the pending full-suite requirements remain in force.

Update the paired handoff with actual results and give Claude the exact PR head. New code requires updated review. Q01 has accepted-claim, parent and overlap evidence; Q02–Q05 have the bounded source change and passing focused/security/recovery regressions. Q06 remains pending full exact-head CI, and Q07 pending PR/exact-head handoff and Claude review; Q08 is not applicable to deployment. F5 stays OPEN; official T1B-01/T1B-02 and unperformed runtime UAT stay Not tested.

Rollback requires no schema or data migration. Reverting reintroduces loss on future refreshes; it cannot reconstruct values already discarded by an earlier operation. Never fill historical rooms from generic seed values. B-V01a initial-register UI, B-V01b navigation, B-D03 pending publication and B-CA01/B-CA02 Calendar findings remain separate tasks.
