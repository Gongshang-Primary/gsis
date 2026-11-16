# v1 deployment checklist after the 26bbccd release

- Status: review preparation; documentation only.
- Owner/model: Codex. Coordinator: ChatGPT (v1). Independent reviewer: Claude, exact head.
- Updated: 16 November 2026, 11:36 SGT.
- Branch: `codex/v1-deployment-checklist-20261116`.
- Base: `5386513881734c8b9177896b9a89bb19ae42324f` (main after the authorised #184 merge).
- Authority: owner instruction of 16 November: prepare, do not run, the deployment checklist for changes since `26bbccd`; preserve #176/#181 conditions and hosted Run B checks.

## Exact file scope

1. `docs/coordination/tasks/v1-deployment-checklist-20261116.md`
2. `docs/v1/accelerated-delivery/DEPLOYMENT_CHECKLIST_2026-11-16.md`

No code, tests, workflow, live reads/writes, migration, backup execution, provider activation, deployment or configuration changes. The checklist is not release approval. Implementation PRs #182 and #183 own none of these paths; their current heads are `592fac9982b8935b1d14b8bbff500a1af78aa2c7` and `cca9f2146f382c97468f9bb8621eb8492ec1a2d3`. All remote heads and actual PR file inventories were refreshed. #183 remains pending its recheck record on main.

## Evidence and acceptance

Inventory actual merged changes and migration paths from the last verified hosted source `26bbccd229962700409bb6e9c80b1e9bec170d20`; distinguish pending Roster 0005 from migrations already on main. Record #184's reviewed head, CI and mechanical merge. Carry owner decisions from main `ccab5f75f55f6310748ee2167b58566c4ca53e30`, references to Run B and #176/#181, backup/rollback prerequisites and browser-only future release steps. All unperformed hosted checks remain Not tested. Preserve F5 OPEN and official T1B-01/T1B-02 Not tested.

Validate scope, relative links, whitespace and evidence references. Record actual build/required CI results and omissions without inventing a documentation test suite. Q01–Q08 follow the existing v1 policy; no new policy is introduced. Skill catalog inspected; no skill package needed for this inventory. Repository evidence/ownership principles applied directly; no skill execution claimed.

G03 investigation: on this base an actual built local Worker request to `currentDuty` without a date returned 200, `available:true`, `people:[]`. Existing `tests/v1-product-roster-locks-browser.mjs` repeats that request through the real built browser and passed again, with the canonical build and no tracked drift. #181 already records G03 as disproved; no product change or duplicate test is warranted. A stale/future date supplied by the historical generic probe is not the home screen request. This is local synthetic evidence, not hosted UAT.

## Handoff

Claim accepted on main at `49ceb9b`; the branch starts from that claim. The checklist is prepared. Local canonical build and existing G03 browser/Worker/D1 regression passed; scope, links and whitespace are checked before commit. Required exact-head Node/LORD CI is pending the branch push; the PR will record its result. Q01–Q05 pass by the pinned inventory, ownership, retained release boundaries and no product change. Q06 is pending CI; Q07 is pending Claude exact-head review. Q08: no deployment authority exercised, hosted UAT Not tested. No release operation executed. Claude reviews the resulting documentation PR; the owner decides the actual deployment separately.

## #183 merge checkpoint

Claude's recheck landed at `00a5e6d6a205c3ed132e9b401cf1b6cef12e1e1b`. #183 merged at `056e003fc5da4c770fa14c80073ec82f296e5b33`, second parent exactly approved `cca9f2146f382c97468f9bb8621eb8492ec1a2d3`; tree `1fd9545fda2f4530e6f94070ba9011cd9e82f4c8` matches the clean simulated merge. Exact-head CI runs 43795959570 and 43795964452 passed. The checklist now includes Roster 0005 as merged, unapplied hosted. The first documentation head `7aadb7ea371d7e9da2c6c9a882df60b958ebf90d` passed required Node/LORD CI run 43799342782. This two-file documentation follow-up needs its own exact-head CI and Claude review. No deployment or live-data operation occurred.
