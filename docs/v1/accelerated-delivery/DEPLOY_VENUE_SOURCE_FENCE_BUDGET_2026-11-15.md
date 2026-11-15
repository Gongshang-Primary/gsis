# B-D03: bounded nonstaged Venues source-fence preparation

Model: Codex. Status: nonstaged source-begin batching and focused verification are complete. Final owner-budget, actual nine-Worker integration, unchanged regressions and canonical build pass locally. Child full CI and independent review remain pending. This handoff does not diagnose the hosted exception or claim deployment.

## Source and claim

- Frozen parent: [`f14543449882b47774dc2799298d8d0c1382dbb3`](https://github.com/helper-gsps/gsis/commit/f14543449882b47774dc2799298d8d0c1382dbb3), branch `codex/v1-deploy-venue-uses`, PR [#169](https://github.com/helper-gsps/gsis/pull/169). Parent full CI [43680646355](https://github.com/helper-gsps/gsis/actions/runs/43680646355) passes 1,184 Node programs and 40 LORD programs per shard. Parent focused 11/11, canonical/no-drift and unchanged regressions pass; parent product/build CI [43681374870](https://github.com/helper-gsps/gsis/actions/runs/43681374870) is also green with 85/85 product programs; artifact `14147959480`. PR #169 is ready for review. Claude review remains pending. None is child verification.
- Discovery: [`UAT_RUN_B_2026-11-15.md` at `9b6b9361a42de0e54153e7a0a63d719150ac2392`](https://github.com/helper-gsps/gsis/blob/9b6b9361a42de0e54153e7a0a63d719150ac2392/docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md), B-D03.
- Branch: `codex/v1-deploy-venue-source-fence-budget`.
- [Task record](../../coordination/tasks/v1-deploy-venue-source-fence-budget.md): accepted on main at [`91811d9aa893a73026d53ad703bba1aef107a890`](https://github.com/helper-gsps/gsis/commit/91811d9aa893a73026d53ad703bba1aef107a890), following `68f0504f408a52b00d1d0cd625f21a3ea87c76f2`.
- Claim incorporated before edits at local `498576d65e3e951f05b9c1de3f41ff277c40c40f`, tree `49ae2a2e23abe28789788788b52cbbcc8901150b`. Public preimplementation equivalent merge `9c435ddc99c80398970ef18b65b7ec3363d802ec` has the same tree. These are preimplementation bases, not tested implementation heads.
- Child PR, final exact head, CI and Claude verdict: pending.

The 13:31 SGT refresh inspected all branches, claims, CI and actual file inventories of 29 open PRs. Only frozen same-builder #160/#168/#169 overlap the integration test; no open PR changes the proposed Venues service path. Run B remains at the reference above and Claude review branch at `58e22a7bf7ba4a49caa2caabe877605153b098db`. The accepted claim and incorporation were verified locally; parent source remains frozen.

## Problem and evidence

For each nonstaged reference, the former Venues source-begin read a room, added a row guard and inserted one scope. Each guard adds two transaction statements. Successful reference-only SQL grows as `4n + 9`. Local synthetic measurements prove a practical bound failure: 10 references use 49 statements; 11 exceed a simulated 50-statement budget and leave the exact original operation prepared with no fence; 143 unrestricted references use 581 statements and about 4.5 seconds. The real source RPC has a five-second deadline.

This synthetic counterexample does not prove the hosted error's cause or plan limits. The reported 143 physical rooms are not necessarily 143 used references. The generic owning-service message does not distinguish timeout, runtime termination or transport failure.

Source-begin uses explicit internal-system admission after original decision/projection verification. Ordinary Deploy/Core/Contacts admission follows only after it returns. No ordinary source pin is acquired in the failing local path, so removing pins is not the repair.

Preimplementation temporary evidence:

| Evidence | Result and limits |
| --- | --- |
| `/tmp/gsis-b-d03-probe-threshold.log` | Actual local owning D1 and sourceBegin with synthetic proof adapters; 1/10/11/41/143 reference measurements, exact operation/fence/audit checks. Not a nine-Worker or live test. |
| `/tmp/gsis-b-d03-restart-probe.log` | Actual persisted-D1 restart; same original operation/body under still-valid synthetic authority finishes once only the artificial quota is removed; replay adds no fence/audit. Not a post-fix pass. |
| `/tmp/gsis-b-d03-findings.md` | Full read-only analysis and source pins; SHA256 `bdbf0f75af97591b88ff348d14b9d69b9478391d92a6b64d007b38280a34ca3d`. Earlier initial probe's invalid lookup is explicitly excluded there. |

When publishing the Git handoff, carry the material observations and executable tracked tests; temporary paths alone are not durable verification evidence.

## Bounded change

Exactly five paths are allowed:

1. `v1/services/venues/service.mjs`
2. `tests/v1-product-venues-source-fence-budget.mjs`
3. `tests/v1-product-deploy-venues.mjs`
4. `docs/coordination/tasks/v1-deploy-venue-source-fence-budget.md`
5. `docs/v1/accelerated-delivery/DEPLOY_VENUE_SOURCE_FENCE_BUDGET_2026-11-15.md`

Venues owns the snapshot, conflict checks and atomic fence transaction. Deploy retains publication/pointer ownership; Core retains source authority. The accepted claim controls the detailed invariants and acceptance list. No Core/shared runtime, Deploy service, staged projection, schema, migration, frontend or configuration path is authorised.

The implementation replaces per-room SELECT/guard/write fanout with one bounded owner snapshot, one set revision guard, separate direct/linked conflict guards, and two bulk zero-range/occupancy scope inserts. Every raw reference still undergoes strict owner-revision equality before deduplication, so numeric-looking strings or contradictory duplicates cannot pass through SQLite coercion. Reference markers precede sorted occupancies, preserving INSERT OR IGNORE identity behavior even when duplicate starts have different ends; every normalized scope is conflict-checked. The original fence header, complete scope set, receipt and audit remain one guarded D1 transaction.

`sourceProof`, `scopeRows`, preparation intent, operation/body/source identities, replay/results, `sourceComplete`, staged dispatch and generic runtime remain unchanged. No new pin mechanism or raised timeout. The source prefix through preparation and suffix after sourceBegin were verified byte-identical to the incorporated parent.

Conflict parity includes direct rooms and nonempty linked overlap groups, booking/closure kinds, confirmed/pending/active statuses, both stored-interval and room buffers, and strict overlap boundaries. Room metadata must still match the captured revision at commit. SourceBegin validates interval shape/duration but has no independent opening-hours policy; preserve existing booking/opening-hours rules unchanged.

Normal success targets: at most 25 owner SQL statements, constant batch count, at most 100 binds per statement, less than 1 MiB serialized SQL-bound JSON for the request, bounded distinct-ID snapshot, and no per-room transactions. Measure all batch statements, not only batch API calls. Preserve raw 1,000-reference/10,000-scope count limits and existing transport size bounds. The implementation counts UTF-8 bytes for every repeated normalized binding, including three occupancy-tuple bindings, and rejects at 1,040,000 bytes. This leaves 8,576 bytes below 1 MiB for existing bounded receipt/audit bindings. Snapshot IDs are bounded before query; aggregate material is bounded before commit. Invalid non-scalar overlap groups or non-finite buffered endpoints reject rather than coercing to JSON text/SQL NULL. Actual measurements are recorded below.

## Local verification and measured budgets

These are development working-tree results, not passes at a published implementation SHA. The final head/base and CI links will be recorded in PR metadata. Runtime commands use `TZ=Asia/Singapore`; no program timeout changed.

The tracked owner-budget program executes real Venues sourceBegin and actual owning D1 with synthetic Core-decision/Deploy-projection adapters. Its counters include single queries and every statement inside batches. Setup is excluded from the measured invocation. The separate integration program executes the real nine-Worker Core/Contacts/Deploy/Venues route; it does not substitute those proof adapters.

| Owner path in the final run | Attempted/dispatched/completed SQL | Batch statements | Maximum binds | Aggregate JSON-bound bytes |
| --- | --- | --- | --- | --- |
| 1 reference | 13 / 13 / 13 | 8 | 11 | 475 |
| 10 references | 13 / 13 / 13 | 8 | 11 | 839 |
| 11 references | 13 / 13 / 13 | 8 | 11 | 879 |
| 41 references | 13 / 13 / 13 | 8 | 11 | 2,079 |
| 143 references | 13 / 13 / 13 | 8 | 11 | 6,163 |
| 1,000 references | 13 / 13 / 13 | 8 | 11 | 40,447 |
| Occupied case | 18 / 18 / 18 | 13 | 11 | 956 |
| 700 distinct scopes, 100-emoji overlap group | 18 / 18 / 18 | 13 | 11 | 911,579 |
| Original prepared attempt after restart | 13 / 13 / 13 | 8 | 11 | 6,187 |

These final metrics meet the normal-path targets. JSON byte counts include repeated bindings and receipt/audit JSON. With the same Unicode metadata, 1,000 distinct scopes reject `BOUNDS_EXCEEDED` after four SQL statements and no fence. The 10,000 raw duplicate-occupancy boundary succeeds through the unchanged scope normalization; 10,001 rejects before owner SQL. This proves bounded preparation, not large lifecycle completion.

The log records attempted, dispatched and completed statements for all 60 negative invocations. Typical conflict/race failures attempt and dispatch 19 statements but complete six; the 13-statement failed transaction is not counted as successful completion and leaves no partial fence/audit. The injected pre-fence failure records 14 attempted, six dispatched/completed. Retrying that original operation after real persistent-D1 restart uses 13 statements with unchanged digest/fence and one audit.

| Executed check | Actual result and evidence |
| --- | --- |
| `node tests/v1-product-venues-source-fence-budget.mjs` before source edit | Meaningful red: 11 references cross the synthetic 50-statement limit, 54 attempted/15 dispatched/15 completed SQL. The 38-statement batch is refused before dispatch; the recovery read raises the final attempted count. Exact local operation remains prepared/fence 1 with no source fence. 8.665s; `/tmp/gsis-source-fence-budget-red.log`. |
| Final `node tests/v1-product-venues-source-fence-budget.mjs` | 8/8 groups pass in 20.391s; `/tmp/gsis-source-fence-budget-final.log`. Earlier eight-group 20.909s result remains `/tmp/gsis-source-fence-budget-green.log`. Final test SHA-256 `bf1ab292a252de34c967153ebe8fd8e8d21bce592b5682bcb2a86ff675a9dd59`. |
| `node tests/v1-product-deploy-venues.mjs` | 13/13 actual nine-Worker groups pass, 19.602s; `/tmp/gsis-b-d03-deploy-integration-green1.log`. Original 11 groups and fixed sequence/count assertions remain intact; two new groups append afterward and use the existing restart. |
| Twenty unchanged regression programs | All exit 0; `/tmp/gsis-source-fence-regressions.log`. Eight product plus five Core/seven Contacts, with 56 Core/Contacts cases. |
| Actual D1 `EXPLAIN QUERY PLAN` | Room revisions use `sqlite_autoindex_venues_records_1`; direct conflicts use `venues_intervals_overlap`; linked conflicts use `venues_intervals_linked`. Bounded JSON scopes are the outer scan and indexed room/interval matches the inner lookup. `/tmp/gsis-source-fence-query-plan.log`; no global room-by-interval scan. |
| Source/test syntax, cached Prettier and scoped whitespace | Pass on final service/test files. No dependency changes. |
| `npm run build` | Baseline and final builds pass all 18 components with no tracked generated drift; `/tmp/gsis-source-fence-canonical-final.log`. |
| Existing runner discovery | 86 product and 1,185 Node programs, including the new budget test; `/tmp/gsis-source-fence-product-discovery.json`, `/tmp/gsis-source-fence-node-discovery.json`. Lists verified unique. Discovery is not execution. |
| Full child product/Node/LORD, exact-head CI, PR and Claude review | Pending publication and exact-head checks. Parent CI is not child verification. |

The final owner-D1 groups cover raw count/byte/strict revision/school rejection; duplicate scope identity and insertion precedence; direct/linked bookings and closures, statuses, both buffers and strict half-open boundaries; snapshot-to-commit revision/metadata/booking races with no partial fence/audit; source/body/expiry checks; local durable abort versus late writer; concurrent identical attempts and response loss; and same-ID/fence/digest restart. A local owner abort test does not prove atomic remote-source cancellation after source proof. The remote-source check-to-local-commit interval remains: the source can change between its verified response and the destination commit. This repair neither closes that interval nor claims cross-D1 atomicity.

The real integration creates exactly 143 synthetic physical rooms. Publications use 41 then 143 references, exclude the other 102 rooms in the first fence, and produce no timed occupancy. It verifies original Core request/actor/school/digest evidence, immutable prepared/envelope/publication payloads, lost publication reply and exact receipt replay, one pointer advance per publication, complete zero-range scope membership, one local fence audit, source completion/adoption and durable restart readback. Pointer sequences 2 and 3 follow the unchanged original sequence assertions. A sealed pending Venues fence alone is never treated as a committed Deploy publication.

Unchanged product regressions are `v1-product-venues.mjs`, `v1-product-venues-staged.mjs`, `v1-product-venues-receipts.mjs`, `v1-product-venues-notifications.mjs`, `v1-product-deploy-storage.mjs`, `v1-product-deploy-clear-authority.mjs`, `v1-product-deploy-save-recovery.mjs` and `v1-product-deploy-workbooks.mjs`. The staged program passes 40,800 intervals/160 chunks in 29.222s including process overhead; this retains existing behavior without certifying a new staged query budget. Owner-only programs identify their synthetic dependency adapters; Core/Contacts contract limitations remain. Two accidentally overlapping standalone Venues/staged runs also passed and were not repeated after the coordinator stopped duplication; the 20-program log is the consolidated regression evidence.

All observed focused programs remain within the existing 45-second limit. The tracked red remains a failure; the separate final run supplies the pass. The initial exploratory probe with an invalid `intent_json` lookup remains excluded; the tracked red and subsequent tests replace that diagnostic as implementation evidence.

## Limits, rollback and next gate

Staged Roster source-begin and nonstaged sourceComplete scalability are unchanged and remain separate measured work; this does not certify every 10,000-scope lifecycle. The present repair targets nonstaged preparation, especially Deploy's empty-occupancy planning-reference publication. Focused occupancy parity is exercised, but large end-to-end occupancy adoption remains outside the new budget claim.

No migration/configuration/provider change is required. Code rollback restores the old fanout; it neither erases nor repairs original durable operations. The live pending publication must not be silently replaced, aborted, retried or supplied with fabricated fences/receipts. Owner-authorised original-ID recovery and controlled hosted publication evidence remain separate gates.

F5 remains OPEN. Official T1B-01/T1B-02 and unperformed hosted runtime UAT remain Not tested. The accepted claim is already incorporated. Next steps are final Git/PR evidence, the full 86-product and 1,185-Node/LORD suites through exact-head CI, and Claude review. No child local full-suite run is claimed. Hosted B-D03 remains open until separately authorised evidence proves the reviewed deployed behavior and original-operation recovery. No merge or deployment is authorised.
