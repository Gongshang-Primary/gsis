# v1 Roster workload: do not choose an ambiguous saved version

- Status: claimed.
- Owner/model: Codex; coordinator ChatGPT v1; independent reviewer Claude, exact head.
- Updated: 16 November 2026, 11:48 SGT.
- Branch: `codex/v1-roster-ambiguous-workload`.
- Base: `056e003fc5da4c770fa14c80073ec82f296e5b33`, main after reviewed #183.
- Authority: owner 16 November work order 3(a), #181 C-1. More than one matching saved version must produce unavailable workload with a reason, never an arbitrary newest version or zero R.

## Exact scope

1. `docs/coordination/tasks/v1-roster-ambiguous-workload.md`
2. `docs/v1/roster/WORKLOAD_SNAPSHOT_HANDOFF.md`
3. `v1/services/deploy/roster-workload.mjs`
4. `tests/v1-product-roster-ambiguous-workload.mjs`

#183 merged at the exact reviewed head `cca9f2146f382c97468f9bb8621eb8492ec1a2d3`, following Claude's main recheck `00a5e6d6a205c3ed132e9b401cf1b6cef12e1e1b`; CI runs 43795959570 and 43795964452 are green. Merge tree `1fd9545fda2f4530e6f94070ba9011cd9e82f4c8` equals the clean simulation; every product path equals the reviewed head. No deployment. Thus this adapter no longer overlaps an open #183 task. The v0.9 #182 branch, F08 and deployment-checklist files are disjoint. The unpublished Drive package claim is deferred locally until this smaller priority item has its accepted claim.

## Change and verification

Bound the matching query to two rows. In the no-publication path return the existing unavailable-source contract when the match count is zero or greater than one, with an explicit ambiguity reason and no selected source ID or fabricated quota. Preserve pointer and candidate rechecks. The verified-publication path still takes precedence over every saved draft.

Prove overlapping dated versions and blank date ranges on the real built browser/Workers/D1 path, including the visible reason. Verify one remaining matching version resumes estimates, deletion/foreign-school rows cannot create a false ambiguity, no verified R or automatic publication is invented, and existing published/draft-edit regressions remain green. Re-run canonical build, discovery, product and full required Node/LORD exact-head CI. No probe exception belongs to C-1, so the allowlist is unchanged.

No migration, provider, hosted data, v0.9, allocation policy, permission/revision guard or unrelated UI change. Visible change: the estimated-workload banner explains that matching planning versions are ambiguous instead of naming an arbitrary source. Rollback only restores the unsafe choice; no data conversion. Repository principles applied directly; no separate skill execution needed for this bounded defect. Q01–Q08 evidence belongs in the completed task/PR. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Handoff

Implementation pending. No merge or deployment authorised for this new PR. Claude reviews the exact tested head.
